import { supabase } from "../lib/supabase";
import {
  openStudyVaultDB,
  STORE_FILES,
  STORE_FOLDERS,
  STORE_NOTES,
  STORE_RESOURCES,
  STORE_SUBJECTS,
} from "./database";

const STORE_NAMES = [STORE_SUBJECTS, STORE_RESOURCES, STORE_FILES, STORE_NOTES, STORE_FOLDERS] as const;
const BACKUP_FORMAT = "studyvault-backup";
const BACKUP_VERSION = 1;
const LAST_BACKUP_PREFIX = "studyvault-cloud-snapshot-success-v1:";

type EncodedBlob = { __studyVaultBlob: true; type: string; dataUrl: string };
type Snapshot = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  stores: Record<string, unknown[]>;
  localState: Record<string, string>;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read local StudyVault data."));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Cloud backup read failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Cloud backup read was aborted."));
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not encode a StudyVault attachment."));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read a StudyVault attachment."));
    reader.readAsDataURL(blob);
  });
}

async function encodeRecord(value: unknown): Promise<unknown> {
  if (!value || typeof value !== "object" || !("blob" in value)) return value;
  const record = value as Record<string, unknown>;
  if (!(record.blob instanceof Blob)) return value;
  const encoded: EncodedBlob = {
    __studyVaultBlob: true,
    type: record.blob.type,
    dataUrl: await blobToDataUrl(record.blob),
  };
  return { ...record, blob: encoded };
}

function readLocalState(): Record<string, string> {
  const localState: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("studyvault-")) {
      const value = localStorage.getItem(key);
      if (value !== null) localState[key] = value;
    }
  }
  return localState;
}

/**
 * Upload a complete, private snapshot of this browser's StudyVault IndexedDB
 * stores and StudyVault-owned localStorage values to the current user's folder.
 * Daily snapshots are replaced in place; record-level cloud sync continues
 * to handle individual edits between snapshots.
 */
export async function createDailyCloudSnapshot(): Promise<{ records: number; path: string; skipped: boolean }> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to create an automatic cloud backup.");

  const userId = data.user.id;
  const now = new Date();
  const day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const markerKey = `${LAST_BACKUP_PREFIX}${userId}`;
  try {
    const marker = JSON.parse(localStorage.getItem(markerKey) ?? "null") as { day?: string; records?: number } | null;
    if (marker?.day === day && typeof marker.records === "number") {
      return { records: marker.records, path: `${userId}/snapshots/studyvault-backup-${day}.json`, skipped: true };
    }
  } catch {
    // A malformed marker is ignored and a fresh snapshot is made.
  }

  const db = await openStudyVaultDB();
  const transaction = db.transaction([...STORE_NAMES], "readonly");
  const completed = transactionResult(transaction);
  const entries = await Promise.all(STORE_NAMES.map(async (name) => {
    const records = await requestResult<unknown[]>(transaction.objectStore(name).getAll());
    return [name, await Promise.all(records.map(encodeRecord))] as const;
  }));
  await completed;

  const stores = Object.fromEntries(entries);
  const recordCount = entries.reduce((total, [, records]) => total + records.length, 0);
  const snapshot: Snapshot = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    stores,
    localState: readLocalState(),
  };

  const path = `${userId}/snapshots/studyvault-backup-${day}.json`;
  const file = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
  const { error: uploadError } = await supabase.storage
    .from("studyvault-files")
    .upload(path, file, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "3600",
    });

  if (uploadError) {
    throw new Error(`Automatic cloud backup upload failed: ${uploadError.message}`);
  }

  try {
    localStorage.setItem(markerKey, JSON.stringify({ day, records: recordCount, path, uploadedAt: now.toISOString() }));
  } catch (storageError) {
    console.warn("[StudyVault] Cloud snapshot uploaded, but the local success marker could not be saved:", storageError);
  }

  return { records: recordCount, path, skipped: false };
}
