/**
 * StudyVault — IndexedDB Storage Service
 *
 * Schema (v2):
 *   subjects  — keyPath: "id"     — stores Subject objects (JSON-serialisable)
 *   resources — keyPath: "id"     — stores resource metadata (no File object)
 *   files     — keyPath: "id"     — stores { id: resourceId, blob, name, type }
 *   notes     — keyPath: "id"     — stores structured Note objects
 *   folders   — keyPath: "id"     — stores Folder objects
 *
 * All exported functions are async and reject with a typed Error on failure.
 * Callers should catch and handle errors gracefully; none of them throw
 * synchronously.
 */

import type { Resource, ResourceType } from "../types/resource";
import type { Subject } from "../Subjects";
import {
    openStudyVaultDB,
    STORE_FILES,
    STORE_RESOURCES,
    STORE_SUBJECTS,
} from "./database";

// ---------------------------------------------------------------------------
// Database constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Serialisable resource shape (no File object)
// ---------------------------------------------------------------------------

/** What we actually write into IndexedDB for each resource. */
type StoredResource = Omit<Resource, "file"> & {
    hasFile: boolean;
};

/** What we store in the "files" object store. */
type StoredFile = {
    /** Same as the parent resource's id. */
    id: string;
    blob: Blob;
    name: string;
    mimeType: string;
};

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function idbGetAll<T>(store: IDBObjectStore): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
    });
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
    });
}

function idbPut(store: IDBObjectStore, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = store.put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function idbDelete(store: IDBObjectStore, key: IDBValidKey): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function idbClear(store: IDBObjectStore): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function supportsAttachment(type: ResourceType): boolean {
    return type === "PDF" || type === "Document" || type === "Image";
}

// ---------------------------------------------------------------------------
// Subject operations
// ---------------------------------------------------------------------------

/**
 * Persist the full subjects array. Replaces all stored subjects.
 * Safe to call on every React state change.
 */
export async function saveSubjects(subjects: Subject[]): Promise<void> {
    const db = await openStudyVaultDB();
    const tx = db.transaction(STORE_SUBJECTS, "readwrite");
    const store = tx.objectStore(STORE_SUBJECTS);

    await idbClear(store);
    for (const subject of subjects) {
        await idbPut(store, subject);
    }

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Load all subjects. Returns an empty array when the store is empty. */
export async function loadSubjects(): Promise<Subject[]> {
    const db = await openStudyVaultDB();
    const tx = db.transaction(STORE_SUBJECTS, "readonly");
    return idbGetAll<Subject>(tx.objectStore(STORE_SUBJECTS));
}

// ---------------------------------------------------------------------------
// Resource operations
// ---------------------------------------------------------------------------

/**
 * Persist a single resource (upsert).
 * The File object, if present, is stored separately in the files store.
 */
export async function saveResource(resource: Resource): Promise<void> {
    const db = await openStudyVaultDB();

    const { file, ...metadata } = resource;
    const tx = db.transaction([STORE_RESOURCES, STORE_FILES], "readwrite");
    const resourceStore = tx.objectStore(STORE_RESOURCES);
    const fileStore = tx.objectStore(STORE_FILES);
    const existing = await idbGet<StoredResource>(resourceStore, resource.id);
    const fileForStorage = supportsAttachment(resource.type) ? file : undefined;
    const preserveExistingFile = supportsAttachment(resource.type)
        && !fileForStorage
        && existing?.hasFile === true;
    const storedResource: StoredResource = {
        ...metadata,
        hasFile: Boolean(fileForStorage) || preserveExistingFile,
    };

    await idbPut(resourceStore, storedResource);

    if (fileForStorage) {
        const storedFile: StoredFile = {
            id: resource.id,
            blob: fileForStorage,
            name: fileForStorage.name,
            mimeType: fileForStorage.type,
        };
        await idbPut(fileStore, storedFile);
    } else if (!preserveExistingFile) {
        await idbDelete(fileStore, resource.id);
    }

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Delete a resource and its associated file blob (if any).
 */
export async function deleteResource(id: string): Promise<void> {
    const db = await openStudyVaultDB();
    const tx = db.transaction([STORE_RESOURCES, STORE_FILES], "readwrite");

    await idbDelete(tx.objectStore(STORE_RESOURCES), id);
    await idbDelete(tx.objectStore(STORE_FILES), id);

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Load all resources, rehydrating File objects from stored Blobs where
 * available. Resources whose file was never stored (e.g. link or note) will
 * have no `file` property.
 */
export async function loadResources(): Promise<Resource[]> {
    const db = await openStudyVaultDB();

    // Read both stores in one transaction
    const tx = db.transaction([STORE_RESOURCES, STORE_FILES], "readonly");

    const [storedResources, storedFiles] = await Promise.all([
        idbGetAll<StoredResource>(tx.objectStore(STORE_RESOURCES)),
        idbGetAll<StoredFile>(tx.objectStore(STORE_FILES)),
    ]);

    // Build a quick lookup map for files
    const fileMap = new Map<string, StoredFile>(
        storedFiles.map((sf) => [sf.id, sf])
    );

    const resources: Resource[] = storedResources.map((stored) => {
        const { hasFile, ...metadata } = stored;
        const resource: Resource = { ...metadata } as Resource;

        if (hasFile) {
            const sf = fileMap.get(stored.id);
            if (sf) {
                // Reconstruct a File from the stored Blob so the rest of the
                // app can use it identically to an originally-uploaded File.
                resource.file = new File([sf.blob], sf.name, {
                    type: sf.mimeType,
                });
            }
            // If the stored file is unexpectedly missing we simply omit it;
            // the app will show the "file unavailable" fallback message.
        }

        return resource;
    });

    // Preserve newest-first ordering (resources are stored in insertion order
    // but we want the same order the user sees in the UI).
    return resources.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

/**
 * Check whether the IndexedDB API is available in the current browser.
 * Returns false in environments that block it (e.g. some private modes).
 */
export function isStorageAvailable(): boolean {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
}

/**
 * Type exported so App.tsx can use it without re-declaring.
 * Matches the ResourceType used in resource.ts.
 */
export type { ResourceType };
