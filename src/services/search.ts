import type { Folder, Note } from "../types/note";
import type { Resource } from "../types/resource";
import type { Subject } from "../Subjects";
import { legacyResourceToNote } from "./legacyNoteAdapter";

export type SearchFilter = "all" | "notes" | "resources" | "subjects" | "folders";
export type SearchResultType = "Note" | "Resource" | "Subject" | "Folder";

export type SearchResult = {
    id: string;
    type: SearchResultType;
    title: string;
    preview: string;
    searchText?: string;
    score: number;
    updatedAt?: string;
    subjectName?: string;
    folderName?: string;
    resourceType?: Resource["type"];
    tags?: string[];
    pinned?: boolean;
    favourite?: boolean;
    status?: Note["status"];
    legacy?: boolean;
};

export type SearchIndexInput = {
    notes: Note[];
    resources: Resource[];
    subjects: Subject[];
    folders: Folder[];
};

const SCORE = {
    exactTitle: 1000,
    titlePrefix: 800,
    titleWord: 700,
    tag: 600,
    subjectOrFolder: 500,
    content: 400,
    description: 300,
};

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

function words(value: string): string[] {
    return normalize(value).split(/\s+/).filter(Boolean);
}

function preview(value: string): string {
    const compact = value.replace(/\s+/g, " ").trim();
    return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact || "No additional content";
}

function scoreDocument(
    title: string,
    fields: { tag?: string[]; subject?: string; folder?: string; content?: string; description?: string },
    query: string
): number {
    const normalizedQuery = normalize(query);
    const normalizedTitle = normalize(title);
    if (!normalizedQuery) return 0;
    if (normalizedTitle === normalizedQuery) return SCORE.exactTitle;
    if (normalizedTitle.startsWith(normalizedQuery)) return SCORE.titlePrefix;
    if (words(title).some((word) => word === normalizedQuery)) return SCORE.titleWord;
    if (fields.tag?.some((tag) => normalize(tag).includes(normalizedQuery))) return SCORE.tag;
    if (fields.subject && normalize(fields.subject).includes(normalizedQuery)) return SCORE.subjectOrFolder;
    if (fields.folder && normalize(fields.folder).includes(normalizedQuery)) return SCORE.subjectOrFolder;
    if (fields.content && normalize(fields.content).includes(normalizedQuery)) return SCORE.content;
    if (fields.description && normalize(fields.description).includes(normalizedQuery)) return SCORE.description;
    return 0;
}

export function buildSearchIndex({ notes, resources, subjects, folders }: SearchIndexInput): SearchResult[] {
    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const persistedNoteIds = new Set(notes.map((note) => note.id));
    const results: SearchResult[] = [];

    notes.forEach((note) => {
        const score = scoreDocument(note.title, {
            tag: note.tags,
            subject: note.subjectId === undefined ? undefined : subjectById.get(note.subjectId)?.name,
            folder: note.folderId === undefined ? undefined : folderById.get(note.folderId)?.name,
            content: note.plainText,
        }, "__index__");
        results.push({
            id: note.id,
            type: "Note",
            title: note.title,
            preview: preview(note.plainText),
            searchText: note.plainText,
            score,
            updatedAt: note.updatedAt,
            subjectName: note.subjectId === undefined ? undefined : subjectById.get(note.subjectId)?.name,
            folderName: note.folderId === undefined ? undefined : folderById.get(note.folderId)?.name,
            tags: note.tags,
            pinned: note.pinned,
            favourite: note.favourite,
            status: note.status,
        });
    });

    resources.forEach((resource) => {
        const legacyNote = legacyResourceToNote(resource);
        if (legacyNote) {
            if (!persistedNoteIds.has(resource.id)) {
                const subjectName = subjectById.get(resource.subjectId)?.name;
                results.push({
                    id: legacyNote.id,
                    type: "Note",
                    title: legacyNote.title,
                    preview: preview(legacyNote.plainText),
                    searchText: legacyNote.plainText,
                    score: 0,
                    updatedAt: legacyNote.updatedAt,
                    subjectName,
                    tags: legacyNote.tags,
                    status: legacyNote.status,
                    legacy: true,
                });
            }
            return;
        }

        results.push({
            id: resource.id,
            type: "Resource",
            title: resource.title,
            preview: preview(resource.description || resource.url || resource.file?.name || ""),
            searchText: [resource.description, resource.url, resource.file?.name].filter(Boolean).join(" "),
            score: 0,
            updatedAt: resource.createdAt,
            subjectName: subjectById.get(resource.subjectId)?.name,
            resourceType: resource.type,
        });
    });

    subjects.forEach((subject) => {
        results.push({
            id: String(subject.id),
            type: "Subject",
            title: subject.name,
            preview: preview(subject.description),
            searchText: subject.description,
            score: 0,
        });
    });

    folders.forEach((folder) => {
        results.push({
            id: folder.id,
            type: "Folder",
            title: folder.name,
            preview: folder.parentId ? `Nested in ${folderById.get(folder.parentId)?.name ?? "another folder"}` : "Root folder",
            score: 0,
            searchText: folder.name,
        });
    });

    return results;
}

export function searchIndex(index: SearchResult[], query: string, filter: SearchFilter = "all"): SearchResult[] {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return [];

    return index
        .filter((result) => filter === "all" || result.type.toLowerCase() === filter.slice(0, -1))
        .map((result) => ({
            result,
            score: scoreDocument(result.title, {
                tag: result.tags,
                subject: result.subjectName,
                folder: result.folderName,
                content: result.type === "Note" ? result.searchText : undefined,
                description: result.type === "Resource" || result.type === "Subject" ? result.searchText : undefined,
            }, normalizedQuery),
        }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score || left.result.title.localeCompare(right.result.title))
        .map(({ result, score }) => ({ ...result, score }));
}
