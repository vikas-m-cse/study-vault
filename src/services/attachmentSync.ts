import { supabase } from "../lib/supabase";
import { CloudSyncError } from "./cloudSync";

async function requireUserId(): Promise<string> {
    if (!supabase) throw new CloudSyncError("Supabase is not configured.");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
        throw new CloudSyncError("Sign in before synchronizing attachments.", { cause: error });
    }
    return data.user.id;
}

function safeFileName(name: string): string {
    const cleaned = name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
    return cleaned.slice(-120) || "attachment";
}

/** Upload an attachment into the private bucket under the current user's UUID. */
export async function uploadResourceAttachment(
    resourceId: string,
    file: File
): Promise<string> {
    if (!resourceId.trim()) throw new CloudSyncError("A resource ID is required for its attachment.");
    const userId = await requireUserId();
    if (!supabase) throw new CloudSyncError("Supabase is not configured.");

    const path = `${userId}/${encodeURIComponent(resourceId)}/${safeFileName(file.name)}`;
    const { error } = await supabase.storage
        .from("studyvault-files")
        .upload(path, file, {
            upsert: true,
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
        });

    if (error) throw new CloudSyncError(`Could not upload attachment "${file.name}".`, { cause: error });
    return path;
}

/** Download an attachment only from the signed-in user's own storage folder. */
export async function downloadResourceAttachment(path: string): Promise<File> {
    const userId = await requireUserId();
    if (!path.startsWith(`${userId}/`)) {
        throw new CloudSyncError("This attachment does not belong to the signed-in account.");
    }
    if (!supabase) throw new CloudSyncError("Supabase is not configured.");

    const { data, error } = await supabase.storage.from("studyvault-files").download(path);
    if (error || !data) throw new CloudSyncError("Could not download this StudyVault attachment.", { cause: error });
    const name = path.split("/").pop() || "attachment";
    return new File([data], decodeURIComponent(name), { type: data.type || "application/octet-stream" });
}
