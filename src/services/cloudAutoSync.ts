import type { Resource } from "../types/resource";
import type { Subject } from "../Subjects";
import type { Note, Folder } from "../types/note";
import { supabase } from "../lib/supabase";
import { pushWorkspaceRecord, pushWorkspaceDeletion, type WorkspaceCollection } from "./cloudSync";
import { uploadResourceAttachment } from "./attachmentSync";
import { loadResources, loadSubjects } from "./storage";
import { getAllFolders, getAllNotes } from "./noteStorage";

const RETRY_QUEUE_KEY = "studyvault-cloud-sync-retry-v1";
const TIMETABLE_PLAN_KEY = "studyvault-daily-timetable-v1";
const TIMETABLE_COMPLETION_KEY = "studyvault-timetable-completions-v1";

type PendingSync = {
    userId: string;
    collection: WorkspaceCollection;
    recordId: string;
    deleted: boolean;
    queuedAt: string;
};

let flushInProgress = false;

function readQueue(): PendingSync[] {
    try {
        const raw = localStorage.getItem(RETRY_QUEUE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is PendingSync =>
            Boolean(item) && typeof item === "object" &&
            typeof item.userId === "string" &&
            typeof item.collection === "string" &&
            typeof item.recordId === "string" &&
            typeof item.deleted === "boolean" &&
            typeof item.queuedAt === "string"
        );
    } catch {
        return [];
    }
}

function writeQueue(queue: PendingSync[]): void {
    try {
        localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(queue.slice(-1000)));
    } catch (error) {
        console.error("[StudyVault] Could not persist the cloud retry queue:", error);
    }
}

async function enqueue(collection: WorkspaceCollection, recordId: string, deleted = false): Promise<void> {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    const queue = readQueue().filter((item) =>
        !(item.userId === userId && item.collection === collection && item.recordId === recordId)
    );
    queue.push({ userId, collection, recordId, deleted, queuedAt: new Date().toISOString() });
    writeQueue(queue);
}

async function uploadResource(resource: Resource): Promise<void> {
    const { file, ...metadata } = resource;
    const cloudFilePath = file
        ? await uploadResourceAttachment(resource.id, file)
        : resource.cloudFilePath;
    await pushWorkspaceRecord("resources", resource.id, {
        ...metadata,
        ...(cloudFilePath ? { cloudFilePath } : {}),
    });
}

async function runOrQueue(
    collection: WorkspaceCollection,
    recordId: string,
    action: () => Promise<void>,
    deleted = false
): Promise<void> {
    try {
        await action();
    } catch (error) {
        try { await enqueue(collection, recordId, deleted); } catch (queueError) {
            console.error("[StudyVault] Could not queue a failed cloud write:", queueError);
        }
        throw error;
    }
}

/**
 * Local IndexedDB/localStorage is the source of truth. Every failed cloud
 * mutation is persisted in a per-account retry queue and retried on reconnect,
 * app start, tab focus, and a short periodic interval.
 */
export async function syncSubjectChanges(current: Subject[], previous: Subject[]): Promise<void> {
    if (!supabase) return;
    const currentIds = new Set(current.map((item) => String(item.id)));
    await Promise.all([
        ...current.map((item) => runOrQueue("subjects", String(item.id),
            () => pushWorkspaceRecord("subjects", String(item.id), item))),
        ...previous.filter((item) => !currentIds.has(String(item.id))).map((item) =>
            runOrQueue("subjects", String(item.id),
                () => pushWorkspaceDeletion("subjects", String(item.id)), true)),
    ]);
}

export async function syncResource(resource: Resource): Promise<void> {
    if (!supabase) return;
    await runOrQueue("resources", resource.id, () => uploadResource(resource));
}

export async function syncResourceDeletion(id: string): Promise<void> {
    if (!supabase) return;
    await runOrQueue("resources", id, () => pushWorkspaceDeletion("resources", id), true);
}

export async function syncNote(note: Note): Promise<void> {
    if (!supabase) return;
    await runOrQueue("notes", note.id, () => pushWorkspaceRecord("notes", note.id, note));
}

export async function syncNoteDeletion(id: string): Promise<void> {
    if (!supabase) return;
    await runOrQueue("notes", id, () => pushWorkspaceDeletion("notes", id), true);
}

export async function syncFolder(folder: Folder): Promise<void> {
    if (!supabase) return;
    await runOrQueue("folders", folder.id, () => pushWorkspaceRecord("folders", folder.id, folder));
}

export async function syncFolderDeletion(id: string): Promise<void> {
    if (!supabase) return;
    await runOrQueue("folders", id, () => pushWorkspaceDeletion("folders", id), true);
}

export async function syncTimetable(plan: unknown, completions: unknown): Promise<void> {
    if (!supabase) return;
    await Promise.all([
        runOrQueue("timetable", "plan", () => pushWorkspaceRecord("timetable", "plan", plan)),
        runOrQueue("timetable_completions", "by-date",
            () => pushWorkspaceRecord("timetable_completions", "by-date", completions)),
    ]);
}

async function retryOne(item: PendingSync): Promise<void> {
    if (item.deleted) {
        await pushWorkspaceDeletion(item.collection, item.recordId);
        return;
    }

    switch (item.collection) {
        case "subjects": {
            const values = await loadSubjects();
            const value = values.find((entry) => String(entry.id) === item.recordId);
            if (value) await pushWorkspaceRecord("subjects", item.recordId, value);
            else await pushWorkspaceDeletion("subjects", item.recordId);
            return;
        }
        case "resources": {
            const values = await loadResources();
            const value = values.find((entry) => entry.id === item.recordId);
            if (value) await uploadResource(value);
            else await pushWorkspaceDeletion("resources", item.recordId);
            return;
        }
        case "notes": {
            const values = await getAllNotes();
            const value = values.find((entry) => entry.id === item.recordId);
            if (value) await pushWorkspaceRecord("notes", item.recordId, value);
            else await pushWorkspaceDeletion("notes", item.recordId);
            return;
        }
        case "folders": {
            const values = await getAllFolders();
            const value = values.find((entry) => entry.id === item.recordId);
            if (value) await pushWorkspaceRecord("folders", item.recordId, value);
            else await pushWorkspaceDeletion("folders", item.recordId);
            return;
        }
        case "timetable": {
            const raw = localStorage.getItem(TIMETABLE_PLAN_KEY);
            if (raw !== null) await pushWorkspaceRecord("timetable", "plan", JSON.parse(raw));
            return;
        }
        case "timetable_completions": {
            const raw = localStorage.getItem(TIMETABLE_COMPLETION_KEY);
            if (raw !== null) await pushWorkspaceRecord("timetable_completions", "by-date", JSON.parse(raw));
            return;
        }
    }
}

/** Retry failed writes for the currently authenticated account; safe to call often. */
export async function flushPendingCloudSync(): Promise<{ synced: number; pending: number }> {
    if (!supabase || flushInProgress || !navigator.onLine) {
        return { synced: 0, pending: readQueue().length };
    }
    flushInProgress = true;
    try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) return { synced: 0, pending: readQueue().length };
        const userId = data.user.id;
        const queue = readQueue();
        const mine = queue.filter((item) => item.userId === userId);
        let synced = 0;

        for (const item of mine) {
            try {
                await retryOne(item);
                const latest = readQueue().filter((queued) =>
                    !(queued.userId === item.userId &&
                      queued.collection === item.collection &&
                      queued.recordId === item.recordId &&
                      queued.queuedAt === item.queuedAt)
                );
                writeQueue(latest);
                synced += 1;
            } catch (error) {
                console.warn("[StudyVault] Cloud retry remains pending:", item.collection, item.recordId, error);
            }
        }
        return { synced, pending: readQueue().filter((item) => item.userId === userId).length };
    } finally {
        flushInProgress = false;
    }
}
