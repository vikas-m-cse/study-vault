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

type EncodedBlob = { __studyVaultBlob: true; type: string; dataUrl: string };
type Backup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  stores: Record<string, unknown[]>;
  localState: Record<string, string>;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Backup transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Backup transaction was aborted."));
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not encode an attachment."));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read an attachment."));
    reader.readAsDataURL(blob);
  });
}

async function encodeRecord(value: unknown): Promise<unknown> {
  if (!value || typeof value !== "object" || !("blob" in value)) return value;
  const record = value as Record<string, unknown>;
  if (!(record.blob instanceof Blob)) return value;
  return {
    ...record,
    blob: {
      __studyVaultBlob: true,
      type: record.blob.type,
      dataUrl: await blobToDataUrl(record.blob),
    } satisfies EncodedBlob,
  };
}

function decodeBlob(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("__studyVaultBlob" in value)) return value;
  const encoded = value as EncodedBlob;
  if (encoded.__studyVaultBlob !== true || typeof encoded.dataUrl !== "string" || typeof encoded.type !== "string") {
    throw new Error("This backup contains an invalid attachment.");
  }
  const comma = encoded.dataUrl.indexOf(",");
  if (comma < 0 || !/^data:[^,]*;base64,/i.test(encoded.dataUrl)) {
    throw new Error("This backup contains a malformed attachment.");
  }
  let binary: string;
  try {
    binary = atob(encoded.dataUrl.slice(comma + 1));
  } catch {
    throw new Error("This backup contains an invalid attachment encoding.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: encoded.type });
}

function validateBackup(value: unknown): asserts value is Backup {
  if (!value || typeof value !== "object") throw new Error("The selected file is not a StudyVault backup.");
  const backup = value as Partial<Backup>;
  if (backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION || !backup.stores || typeof backup.stores !== "object") {
    throw new Error("Unsupported or invalid StudyVault backup format.");
  }
  for (const name of STORE_NAMES) {
    if (!Array.isArray(backup.stores[name])) throw new Error(`Backup is missing the "${name}" data store.`);
  }
  if (!backup.localState || typeof backup.localState !== "object" || Array.isArray(backup.localState)) {
    throw new Error("Backup is missing local study settings.");
  }
  if (Object.values(backup.localState).some((entry) => typeof entry !== "string")) {
    throw new Error("Backup contains invalid local study settings.");
  }
}

export async function downloadStudyVaultBackup(): Promise<void> {
  const db = await openStudyVaultDB();
  const tx = db.transaction([...STORE_NAMES], "readonly");
  const completed = transactionResult(tx);
  const storeEntries = await Promise.all(STORE_NAMES.map(async (name) => {
    const records = await requestResult<unknown[]>(tx.objectStore(name).getAll());
    return [name, await Promise.all(records.map(encodeRecord))] as const;
  }));
  await completed;

  const localState: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith("studyvault-")) {
      const value = localStorage.getItem(key);
      if (value !== null) localState[key] = value;
    }
  }

  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    stores: Object.fromEntries(storeEntries),
    localState,
  };
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `studyvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function restoreStudyVaultBackup(file: File): Promise<void> {
  const parsed: unknown = JSON.parse(await file.text());
  validateBackup(parsed);

  // Decode and validate all records before opening the write transaction.
  const decoded = new Map<string, unknown[]>();
  for (const name of STORE_NAMES) {
    const records = parsed.stores[name];
    decoded.set(name, records.map((record) => {
      if (!record || typeof record !== "object") throw new Error(`Backup contains invalid data in "${name}".`);
      if ("blob" in record) {
        const item = record as Record<string, unknown>;
        return { ...item, blob: decodeBlob(item.blob) };
      }
      return record;
    }));
  }

  const db = await openStudyVaultDB();
  const tx = db.transaction([...STORE_NAMES], "readwrite");
  const completed = transactionResult(tx);
  for (const name of STORE_NAMES) {
    const store = tx.objectStore(name);
    store.clear();
    for (const record of decoded.get(name) ?? []) store.put(record);
  }
  await completed;

  // Keep unrelated localStorage keys intact. If applying settings fails, make a best-effort
  // rollback of StudyVault-owned settings so an interrupted restore is not left half-applied.
  const previousLocalState: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith("studyvault-")) {
      const value = localStorage.getItem(key);
      if (value !== null) previousLocalState[key] = value;
    }
  }

  try {
    const keysToRemove = Object.keys(previousLocalState);
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    for (const [key, value] of Object.entries(parsed.localState)) {
      if (key.startsWith("studyvault-")) localStorage.setItem(key, value);
    }
  } catch (error) {
    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key?.startsWith("studyvault-")) localStorage.removeItem(key);
      }
      for (const [key, value] of Object.entries(previousLocalState)) {
        localStorage.setItem(key, value);
      }
    } catch {
      // Preserve the original restore error if browser storage itself remains unavailable.
    }
    throw new Error(
      error instanceof Error
        ? `Study data was restored, but settings could not be applied: ${error.message}`
        : "Study data was restored, but settings could not be applied.",
      { cause: error },
    );
  }
}
