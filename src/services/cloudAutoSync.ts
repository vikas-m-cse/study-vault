import type { Resource } from "../types/resource";
import type { Subject } from "../Subjects";
import type { Note, Folder } from "../types/note";
import { supabase } from "../lib/supabase";
import { pushWorkspaceRecord, pushWorkspaceDeletion } from "./cloudSync";
import { uploadResourceAttachment } from "./attachmentSync";

/**
 * Event-driven cloud writes. Local IndexedDB remains the source of truth:
 * callers must persist locally first, then invoke these best-effort cloud writes.
 * Never pass a user ID; cloudSync derives ownership from the authenticated session.
 */
export async function syncSubjectChanges(
    current: Subject[],
    previous: Subject[]
): Promise<void> {
    if (!supabase) return;
    const currentIds = new Set(current.map((item) => String(item.id)));
    const writes = current.map((item) =>
        pushWorkspaceRecord("subjects", String(item.id), item)
    );
    const deletes = previous
        .filter((item) => !currentIds.has(String(item.id)))
        .map((item) => pushWorkspaceDeletion("subjects", String(item.id)));
    await Promise.all([...writes, ...deletes]);
}

export async function syncResource(resource: Resource): Promise<void> {
    if (!supabase) return;
    const { file, ...metadata } = resource;
    const cloudFilePath = file
        ? await uploadResourceAttachment(resource.id, file)
        : resource.cloudFilePath;
    await pushWorkspaceRecord("resources", resource.id, {
        ...metadata,
        ...(cloudFilePath ? { cloudFilePath } : {}),
    });
}

export async function syncResourceDeletion(id: string): Promise<void> {
    if (!supabase) return;
    await pushWorkspaceDeletion("resources", id);
}

export async function syncNote(note: Note): Promise<void> {
    if (!supabase) return;
    await pushWorkspaceRecord("notes", note.id, note);
}

export async function syncNoteDeletion(id: string): Promise<void> {
    if (!supabase) return;
    await pushWorkspaceDeletion("notes", id);
}

export async function syncFolder(folder: Folder): Promise<void> {
    if (!supabase) return;
    await pushWorkspaceRecord("folders", folder.id, folder);
}

export async function syncFolderDeletion(id: string): Promise<void> {
    if (!supabase) return;
    await pushWorkspaceDeletion("folders", id);
}

export async function syncTimetable(plan: unknown, completions: unknown): Promise<void> {
    if (!supabase) return;
    await Promise.all([
        pushWorkspaceRecord("timetable", "plan", plan),
        pushWorkspaceRecord("timetable_completions", "by-date", completions),
    ]);
}
