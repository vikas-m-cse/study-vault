import { beforeEach, describe, expect, it } from "vitest";
import {
  openStudyVaultDB,
  STORE_FILES,
  STORE_FOLDERS,
  STORE_NOTES,
  STORE_RESOURCES,
  STORE_SUBJECTS,
} from "./database";
import { restoreStudyVaultBackup } from "./backup";

const STORE_NAMES = [STORE_SUBJECTS, STORE_RESOURCES, STORE_FILES, STORE_NOTES, STORE_FOLDERS];

function fileWithText(text: string): File {
  const file = new File([text], "studyvault-backup.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => text });
  return file;
}

function makeBackup(overrides: Record<string, unknown> = {}) {
  return {
    format: "studyvault-backup",
    version: 1,
    exportedAt: "2026-10-28T00:00:00.000Z",
    stores: {
      subjects: [{ id: "subject-1", name: "Data Structures" }],
      resources: [{ id: "resource-1", title: "Stacks" }],
      files: [{
        id: "file-1",
        name: "sample.txt",
        blob: {
          __studyVaultBlob: true,
          type: "text/plain",
          dataUrl: "data:text/plain;base64,aGVsbG8=",
        },
      }],
      notes: [{ id: "note-1", title: "Revision notes", content: "LIFO" }],
      folders: [{ id: "folder-1", name: "IAT" }],
    },
    localState: { "studyvault-theme": "light" },
    ...overrides,
  };
}

async function putRecord(storeName: string, record: unknown): Promise<void> {
  const db = await openStudyVaultDB();
  const tx = db.transaction([storeName], "readwrite");
  tx.objectStore(storeName).put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
  });
}

async function readRecords(storeName: string): Promise<Record<string, unknown>[]> {
  const db = await openStudyVaultDB();
  const tx = db.transaction([storeName], "readonly");
  const request = tx.objectStore(storeName).getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
}

describe("StudyVault backup restore", () => {
  beforeEach(async () => {
    localStorage.clear();
    await putRecord(STORE_NOTES, { id: "existing-note", title: "Keep me if invalid" });
  });

  it("rejects malformed backups before changing stored study data", async () => {
    await expect(restoreStudyVaultBackup(fileWithText(JSON.stringify({
      format: "not-studyvault",
      version: 1,
      stores: {},
      localState: {},
    })))).rejects.toThrow("Unsupported or invalid StudyVault backup format.");

    expect(await readRecords(STORE_NOTES)).toEqual([
      { id: "existing-note", title: "Keep me if invalid" },
    ]);
  });

  it("restores all stores, decodes attachments, and preserves unrelated browser settings", async () => {
    localStorage.setItem("unrelated-app-setting", "preserve-this");
    localStorage.setItem("studyvault-old-setting", "old");

    await restoreStudyVaultBackup(fileWithText(JSON.stringify(makeBackup())));

    expect(await readRecords(STORE_SUBJECTS)).toEqual([{ id: "subject-1", name: "Data Structures" }]);
    expect(await readRecords(STORE_RESOURCES)).toEqual([{ id: "resource-1", title: "Stacks" }]);
    expect(await readRecords(STORE_NOTES)).toEqual([{ id: "note-1", title: "Revision notes", content: "LIFO" }]);
    expect(await readRecords(STORE_FOLDERS)).toEqual([{ id: "folder-1", name: "IAT" }]);
    const files = await readRecords(STORE_FILES);
    expect(files).toHaveLength(1);
    expect(files[0].blob).toBeInstanceOf(Blob);
    expect((files[0].blob as Blob).type).toBe("text/plain");
    expect(await (files[0].blob as Blob).text()).toBe("hello");
    expect(localStorage.getItem("unrelated-app-setting")).toBe("preserve-this");
    expect(localStorage.getItem("studyvault-old-setting")).toBeNull();
    expect(localStorage.getItem("studyvault-theme")).toBe("light");
  });

  it("rejects malformed attachment encodings without replacing existing records", async () => {
    const backup = makeBackup();
    const stores = backup.stores as { files: { id: string; name: string; blob: unknown }[] };
    stores.files[0].blob = {
      __studyVaultBlob: true,
      type: "text/plain",
      dataUrl: "not-a-data-url",
    };

    await expect(restoreStudyVaultBackup(fileWithText(JSON.stringify(backup)))).rejects.toThrow(
      "This backup contains a malformed attachment.",
    );
    expect(await readRecords(STORE_NOTES)).toEqual([
      { id: "existing-note", title: "Keep me if invalid" },
    ]);
  });

  it("rejects non-string local settings before replacing records", async () => {
    await expect(restoreStudyVaultBackup(fileWithText(JSON.stringify(
      makeBackup({ localState: { "studyvault-theme": 42 } }),
    )))).rejects.toThrow("Backup contains invalid local study settings.");

    expect(await readRecords(STORE_NOTES)).toEqual([
      { id: "existing-note", title: "Keep me if invalid" },
    ]);
  });
});
