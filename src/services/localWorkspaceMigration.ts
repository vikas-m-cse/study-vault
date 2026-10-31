import type { Resource } from "../types/resource";
import type { Subject } from "../Subjects";
import type { Note, Folder } from "../types/note";
import { loadResources, loadSubjects } from "./storage";
import { uploadResourceAttachment } from "./attachmentSync";
import { getAllNotes, getAllFolders } from "./noteStorage";
import {
    pullWorkspaceCollection,
    pushWorkspaceRecord,
    type WorkspaceCollection,
} from "./cloudSync";

const TIMETABLE_PLAN_KEY = "studyvault-daily-timetable-v1";
const TIMETABLE_COMPLETION_KEY = "studyvault-timetable-completions-v1";

export type MigrationSummary = {
    uploaded: Record<WorkspaceCollection, number>;
    skipped: number;
    attachmentsUploaded: number;
};

type LocalRecord = {
    collection: WorkspaceCollection;
    id: string;
    data: unknown;
    updatedAt: string;
    attachment?: File;
};

function parseLocalJson(key: string): unknown {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as unknown : null;
    } catch (error) {
        throw new Error(`Could not read local timetable data (${key}). Nothing was uploaded.`, { cause: error });
    }
}

function timestampOf(value: unknown): string {
    if (typeof value === "object" && value !== null && "updatedAt" in value) {
        const candidate = (value as { updatedAt?: unknown }).updatedAt;
        if (typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))) return candidate;
    }
    if (typeof value === "object" && value !== null && "createdAt" in value) {
        const candidate = (value as { createdAt?: unknown }).createdAt;
        if (typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))) return candidate;
    }
    return new Date(0).toISOString();
}

function recordsFromArray<T extends { id: string | number }>(
    collection: WorkspaceCollection,
    values: T[]
): LocalRecord[] {
    return values.map((value) => ({
        collection,
        id: String(value.id),
        data: value,
        updatedAt: timestampOf(value),
    }));
}

/**
 * Explicit, one-way first-device migration.
 *
 * Safety rules:
 * - Never clears or modifies IndexedDB/localStorage.
 * - Refuses to run if the account already has any cloud records.
 * - Does not download/merge cloud records or start background sync.
 * - Resource File blobs are deliberately excluded; attachment migration is a
 *   separate step so metadata is not falsely reported as a synced file.
 */
export async function migrateLocalWorkspaceToCloud(): Promise<MigrationSummary> {
    const [subjects, resources, notes, folders] = await Promise.all([
        loadSubjects(),
        loadResources(),
        getAllNotes(),
        getAllFolders(),
    ]);

    const plan = parseLocalJson(TIMETABLE_PLAN_KEY);
    const completions = parseLocalJson(TIMETABLE_COMPLETION_KEY);

    let attachmentsUploaded = 0;
    const localRecords: LocalRecord[] = [
        ...recordsFromArray<Subject>("subjects", subjects),
        ...recordsFromArray<Folder>("folders", folders),
        ...recordsFromArray<Note>("notes", notes),
        ...resources.map((resource: Resource) => {
            const { file, ...metadata } = resource;
            return {
                collection: "resources" as const,
                id: resource.id,
                data: metadata,
                updatedAt: timestampOf(resource),
                ...(file ? { attachment: file } : {}),
            };
        }),
    ];

    if (Array.isArray(plan)) {
        localRecords.push({
            collection: "timetable",
            id: "plan",
            data: plan,
            updatedAt: new Date().toISOString(),
        });
    }
    if (completions && typeof completions === "object" && !Array.isArray(completions)) {
        localRecords.push({
            collection: "timetable_completions",
            id: "by-date",
            data: completions,
            updatedAt: new Date().toISOString(),
        });
    }

    const collections: WorkspaceCollection[] = [
        "subjects", "resources", "notes", "folders", "timetable", "timetable_completions",
    ];

    // Preflight all collections before writing anything. If any cloud data
    // exists, stop rather than risk overwriting or creating a partial merge.
    const cloudSnapshots = await Promise.all(collections.map((collection) =>
        pullWorkspaceCollection(collection)
    ));
    const localByKey = new Map(localRecords.map((record) => [
        `${record.collection}:${record.id}`,
        record,
    ]));
    const existingCloudKeys = new Set<string>();

    // Allow a retry after an interrupted first migration only when every
    // existing cloud row exactly matches a corresponding local record.
    // Any unrelated/different cloud data stops the operation safely.
    for (const records of cloudSnapshots) {
        for (const remote of records) {
            const key = `${remote.collection}:${remote.record_id}`;
            const local = localByKey.get(key);
            const remoteData = remote.collection === "resources" && remote.data && typeof remote.data === "object"
                ? { ...(remote.data as Record<string, unknown>), cloudFilePath: undefined }
                : remote.data;
            const localData = local?.collection === "resources" && local.data && typeof local.data === "object"
                ? { ...(local.data as Record<string, unknown>), cloudFilePath: undefined }
                : local?.data;
            if (!local || JSON.stringify(localData) !== JSON.stringify(remoteData)) {
                throw new Error(
                    "This account already has different cloud workspace data. Migration stopped to prevent overwriting or mixing data."
                );
            }
            existingCloudKeys.add(key);
        }
    }

    const uploaded: Record<WorkspaceCollection, number> = {
        subjects: 0,
        resources: 0,
        notes: 0,
        folders: 0,
        timetable: 0,
        timetable_completions: 0,
    };

    for (const record of localRecords) {
        const key = `${record.collection}:${record.id}`;
        const existing = cloudSnapshots.flat().find((remote) =>
            `${remote.collection}:${remote.record_id}` === key
        );
        if (existingCloudKeys.has(key)) {
            const existingPath = existing && existing.data && typeof existing.data === "object"
                ? (existing.data as { cloudFilePath?: unknown }).cloudFilePath
                : undefined;
            if (record.collection !== "resources" || !record.attachment || typeof existingPath === "string") continue;
        }

        let data = record.data;
        if (record.collection === "resources" && record.attachment) {
            const cloudFilePath = await uploadResourceAttachment(record.id, record.attachment);
            data = { ...(record.data as Record<string, unknown>), cloudFilePath };
            attachmentsUploaded += 1;
        } else if (existingCloudKeys.has(key)) {
            continue;
        }

        await pushWorkspaceRecord(record.collection, record.id, data, record.updatedAt);
        if (!existingCloudKeys.has(key)) uploaded[record.collection] += 1;
    }

    return {
        uploaded,
        skipped: 0,
        attachmentsUploaded,
    };
}
