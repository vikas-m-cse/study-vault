import type { Subject } from "../Subjects";
import type { Resource } from "../types/resource";
import type { Note, Folder } from "../types/note";
import {
    openStudyVaultDB,
    STORE_FILES,
    STORE_FOLDERS,
    STORE_NOTES,
    STORE_RESOURCES,
    STORE_SUBJECTS,
} from "./database";
import { pullWorkspaceCollection, type WorkspaceCollection } from "./cloudSync";
import { downloadResourceAttachment } from "./attachmentSync";

const TIMETABLE_PLAN_KEY = "studyvault-daily-timetable-v1";
const TIMETABLE_COMPLETION_KEY = "studyvault-timetable-completions-v1";

type CloudRow = { record_id: string; data: unknown; deleted_at: string | null };
type StoredResource = Omit<Resource, "file"> & { hasFile: boolean };
type StoredFile = { id: string; blob: Blob; name: string; mimeType: string };

export type RestoreSummary = {
    restored: Record<WorkspaceCollection, number>;
    attachmentsDownloaded: number;
};

function activeRows<T>(rows: CloudRow[]): T[] {
    return rows.filter((row) => !row.deleted_at).map((row) => row.data as T);
}


/**
 * Merge active cloud subjects into local IndexedDB without replacing local data.
 * Only the subjects collection is read or modified.
 */
export async function mergeCloudSubjectsToLocal(): Promise<{
    added: number;
    alreadyPresent: number;
}> {
    const rows = await pullWorkspaceCollection("subjects");
    const active = rows.filter((row) => !row.deleted_at);
    if (active.length === 0) {
        throw new Error("No active cloud subjects were found for this account.");
    }

    // Validate every cloud row before opening a write transaction.
    const cloudSubjects = new Map<number, Subject>();
    for (const row of active) {
        const value = row.data as Partial<Subject> | null;
        if (
            !value ||
            !Number.isSafeInteger(value.id) ||
            typeof value.name !== "string" ||
            typeof value.description !== "string" ||
            typeof value.color !== "string" ||
            row.record_id !== String(value.id)
        ) {
            throw new Error("A cloud subject has invalid data. No local subjects were changed.");
        }
        cloudSubjects.set(value.id as number, value as Subject);
    }

    const db = await openStudyVaultDB();
    const tx = db.transaction([STORE_SUBJECTS], "readwrite");
    const store = tx.objectStore(STORE_SUBJECTS);
    let added = 0;
    let alreadyPresent = 0;

    const complete = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Subject merge failed."));
        tx.onabort = () => reject(tx.error ?? new Error("Subject merge was cancelled."));
    });

    const request = store.getAll();
    request.onsuccess = () => {
        const existingIds = new Set(
            (request.result as Subject[]).map((subject) => subject.id)
        );

        for (const subject of cloudSubjects.values()) {
            if (existingIds.has(subject.id)) {
                alreadyPresent += 1;
                continue;
            }

            // add() is insert-only; it cannot overwrite an existing subject.
            store.add(subject);
            existingIds.add(subject.id);
            added += 1;
        }
    };
    request.onerror = () => {
        try {
            tx.abort();
        } catch {
            // The transaction may already have aborted.
        }
    };

    await complete;
    return { added, alreadyPresent };
}

/**
 * Restore only into a completely empty local workspace. All cloud reads and
 * attachment downloads finish before the single IndexedDB write transaction.
 * Existing local data is never cleared or merged.
 */
export async function restoreCloudWorkspaceToLocal(): Promise<RestoreSummary> {
    const collections: WorkspaceCollection[] = [
        "subjects", "resources", "notes", "folders", "timetable", "timetable_completions",
    ];
    const snapshots = await Promise.all(collections.map((collection) => pullWorkspaceCollection(collection)));
    const byCollection = new Map(collections.map((collection, index) => [collection, snapshots[index]]));
    const cloudHasData = snapshots.some((rows) => rows.some((row) => !row.deleted_at));
    if (!cloudHasData) throw new Error("There is no cloud workspace data to restore for this account.");

    const db = await openStudyVaultDB();
    const check = db.transaction(
        [STORE_SUBJECTS, STORE_RESOURCES, STORE_FILES, STORE_NOTES, STORE_FOLDERS],
        "readonly"
    );
    const counts = await Promise.all(
        [STORE_SUBJECTS, STORE_RESOURCES, STORE_FILES, STORE_NOTES, STORE_FOLDERS]
            .map((name) => new Promise<number>((resolve, reject) => {
                const request = check.objectStore(name).count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }))
    );
    await new Promise<void>((resolve, reject) => {
        check.oncomplete = () => resolve();
        check.onerror = () => reject(check.error);
        check.onabort = () => reject(check.error ?? new Error("Could not inspect local workspace."));
    });
    if (counts.some((count) => count > 0)) {
        throw new Error("This device already has local StudyVault data. Restore stopped to protect it. Use a fresh browser profile/device or back up and clear local data deliberately before restoring.");
    }

    // Timetable data lives in localStorage, outside the IndexedDB stores above.
    // Refuse to overwrite either key, even if the IndexedDB workspace is empty.
    try {
        if (localStorage.getItem(TIMETABLE_PLAN_KEY) !== null ||
            localStorage.getItem(TIMETABLE_COMPLETION_KEY) !== null) {
            throw new Error("This device already has local timetable data. Restore stopped to protect it. Back it up or clear it deliberately before restoring.");
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes("Restore stopped")) throw error;
        throw new Error("StudyVault could not safely inspect local timetable data. Restore was stopped.", { cause: error });
    }

    const subjects = activeRows<Subject>(byCollection.get("subjects")!);
    const folders = activeRows<Folder>(byCollection.get("folders")!);
    const notes = activeRows<Note>(byCollection.get("notes")!);
    const cloudResources = activeRows<Omit<Resource, "file">>(byCollection.get("resources")!);
    const resources: StoredResource[] = [];
    const files: StoredFile[] = [];
    let attachmentsDownloaded = 0;

    for (const resource of cloudResources) {
        const path = resource.cloudFilePath;
        if (path) {
            const file = await downloadResourceAttachment(path);
            files.push({ id: resource.id, blob: file, name: file.name, mimeType: file.type });
            resources.push({ ...resource, hasFile: true });
            attachmentsDownloaded += 1;
        } else {
            resources.push({ ...resource, hasFile: false });
        }
    }

    const tx = db.transaction(
        [STORE_SUBJECTS, STORE_RESOURCES, STORE_FILES, STORE_NOTES, STORE_FOLDERS],
        "readwrite"
    );
    const complete = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Cloud restore failed."));
        tx.onabort = () => reject(tx.error ?? new Error("Cloud restore was cancelled."));
    });
    for (const value of subjects) tx.objectStore(STORE_SUBJECTS).put(value);
    for (const value of resources) tx.objectStore(STORE_RESOURCES).put(value);
    for (const value of files) tx.objectStore(STORE_FILES).put(value);
    for (const value of notes) tx.objectStore(STORE_NOTES).put(value);
    for (const value of folders) tx.objectStore(STORE_FOLDERS).put(value);
    await complete;

    const plan = byCollection.get("timetable")!.find((row) => row.record_id === "plan" && !row.deleted_at);
    const completions = byCollection.get("timetable_completions")!.find((row) => row.record_id === "by-date" && !row.deleted_at);
    if (plan) localStorage.setItem(TIMETABLE_PLAN_KEY, JSON.stringify(plan.data));
    if (completions) localStorage.setItem(TIMETABLE_COMPLETION_KEY, JSON.stringify(completions.data));

    return {
        restored: {
            subjects: subjects.length,
            resources: resources.length,
            notes: notes.length,
            folders: folders.length,
            timetable: plan ? 1 : 0,
            timetable_completions: completions ? 1 : 0,
        },
        attachmentsDownloaded,
    };
}
