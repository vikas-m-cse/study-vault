import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

/**
 * Account-scoped cloud persistence.
 *
 * Ownership is always derived from the active Supabase session; callers cannot
 * supply a user ID. Database RLS remains the authoritative security boundary.
 */
export type WorkspaceCollection =
    | "subjects"
    | "resources"
    | "notes"
    | "folders"
    | "timetable"
    | "timetable_completions";

export type WorkspaceRecord<T = unknown> = {
    collection: WorkspaceCollection;
    record_id: string;
    data: T;
    updated_at: string;
    deleted_at: string | null;
};

export class CloudSyncError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "CloudSyncError";
    }
}

async function requireAuthenticatedUser(): Promise<User> {
    if (!supabase) {
        throw new CloudSyncError("Supabase is not configured.");
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) {
        throw new CloudSyncError("Could not verify the current StudyVault account.", { cause: error });
    }
    if (!data.user) {
        throw new CloudSyncError("Sign in before synchronizing StudyVault data.");
    }
    return data.user;
}

/** Read one collection for the current account, including deletion markers. */
export async function pullWorkspaceCollection<T = unknown>(
    collection: WorkspaceCollection
): Promise<WorkspaceRecord<T>[]> {
    await requireAuthenticatedUser();
    if (!supabase) throw new CloudSyncError("Supabase is not configured.");

    const { data, error } = await supabase
        .from("workspace_records")
        .select("collection, record_id, data, updated_at, deleted_at")
        .eq("collection", collection)
        .order("updated_at", { ascending: true });

    if (error) {
        throw new CloudSyncError(`Could not download ${collection} from the cloud.`, { cause: error });
    }

    return (data ?? []) as WorkspaceRecord<T>[];
}

/**
 * Upload or update one record for the signed-in user.
 * The user_id is taken from the verified session, never from caller input.
 */
export async function pushWorkspaceRecord<T>(
    collection: WorkspaceCollection,
    recordId: string,
    value: T,
    updatedAt = new Date().toISOString()
): Promise<void> {
    if (!recordId.trim()) throw new CloudSyncError("A workspace record ID is required.");
    const user = await requireAuthenticatedUser();
    if (!supabase) throw new CloudSyncError("Supabase is not configured.");

    const { error } = await supabase
        .from("workspace_records")
        .upsert({
            user_id: user.id,
            collection,
            record_id: recordId,
            data: value,
            updated_at: updatedAt,
            deleted_at: null,
        }, {
            onConflict: "user_id,collection,record_id",
        });

    if (error) {
        throw new CloudSyncError(`Could not upload ${collection} record "${recordId}".`, { cause: error });
    }
}

/** Write a tombstone so deletion can propagate to other devices. */
export async function pushWorkspaceDeletion(
    collection: WorkspaceCollection,
    recordId: string,
    deletedAt = new Date().toISOString()
): Promise<void> {
    if (!recordId.trim()) throw new CloudSyncError("A workspace record ID is required.");
    const user = await requireAuthenticatedUser();
    if (!supabase) throw new CloudSyncError("Supabase is not configured.");

    const { error } = await supabase
        .from("workspace_records")
        .upsert({
            user_id: user.id,
            collection,
            record_id: recordId,
            data: {},
            updated_at: deletedAt,
            deleted_at: deletedAt,
        }, {
            onConflict: "user_id,collection,record_id",
        });

    if (error) {
        throw new CloudSyncError(`Could not synchronize deletion of ${collection} record "${recordId}".`, { cause: error });
    }
}
