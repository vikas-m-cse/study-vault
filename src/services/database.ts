const IS_TEST = import.meta.env.MODE === "test";

export const DB_NAME = IS_TEST ? "studyvault_test_db" : "studyvault_db";
export const DB_VERSION = 2;

export const STORE_SUBJECTS = "subjects";
export const STORE_RESOURCES = "resources";
export const STORE_FILES = "files";
export const STORE_NOTES = "notes";
export const STORE_FOLDERS = "folders";

let dbPromise: Promise<IDBDatabase> | null = null;
let dbConnection: IDBDatabase | null = null;

/** Open the shared StudyVault database without changing its v2 schema. */
export function openStudyVaultDB(): Promise<IDBDatabase> {
    if (dbConnection) return Promise.resolve(dbConnection);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(STORE_SUBJECTS)) {
                db.createObjectStore(STORE_SUBJECTS, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(STORE_RESOURCES)) {
                db.createObjectStore(STORE_RESOURCES, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(STORE_FILES)) {
                db.createObjectStore(STORE_FILES, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(STORE_NOTES)) {
                db.createObjectStore(STORE_NOTES, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
                db.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            dbConnection = db;
            db.onversionchange = () => {
                db.close();
                dbConnection = null;
                dbPromise = null;
            };
            resolve(db);
        };

        request.onerror = () => {
            dbPromise = null;
            reject(new Error(`IndexedDB open failed: ${request.error?.message ?? "unknown error"}`));
        };

        request.onblocked = () => {
            dbPromise = null;
            reject(new Error("IndexedDB upgrade blocked by another StudyVault tab. Please close other StudyVault tabs and reload."));
        };
    });

    return dbPromise;
}

/** Test-only lifecycle hook; production always uses the real database name. */
export function resetStudyVaultDBForTests(): void {
    if (!IS_TEST) return;
    dbConnection?.close();
    dbConnection = null;
    dbPromise = null;
}
