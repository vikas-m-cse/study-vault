import type { Folder, Note, NoteStatus, TipTapDocument } from "../types/note";
import type { Subject } from "../Subjects";
import {
    isValidTipTapDocument,
    plainTextToTipTapDocument,
    tipTapDocumentToPlainText,
} from "./noteSerialization";
import {
    openStudyVaultDB,
    STORE_FOLDERS,
    STORE_NOTES,
    STORE_SUBJECTS,
} from "./database";

class NoteStorageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NoteStorageError";
    }
}

export type NoteLoadIssue = {
    id: string;
    message: string;
};

export type NoteLoadResult = {
    notes: Note[];
    issues: NoteLoadIssue[];
};

function requireId(id: string, label: string): void {
    if (id.trim().length === 0) {
        throw new NoteStorageError(`${label} ID must not be empty.`);
    }
}

function validateNote(note: Note): void {
    requireId(note.id, "Note");
    if (!isValidTipTapDocument(note.content)) {
        throw new NoteStorageError("Note content must be a valid TipTap document.");
    }
    if (!Array.isArray(note.tags) || !Array.isArray(note.linkedNoteIds)) {
        throw new NoteStorageError("Note tags and linkedNoteIds must be arrays.");
    }
}

function validateFolder(folder: Folder): void {
    requireId(folder.id, "Folder");
    if (folder.name.trim().length === 0) {
        throw new NoteStorageError("Folder name must not be empty.");
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isNoteStatus(value: unknown): value is NoteStatus {
    return value === "active" || value === "archived" || value === "trash";
}

function isValidDateString(value: unknown): value is string {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function normalizeStoredNote(
    value: unknown,
    folderIds: Set<string>,
    subjectIds: Set<number>
): { note: Note; issues: string[] } | null {
    if (!isRecord(value) || typeof value.id !== "string" || value.id.trim().length === 0) {
        return null;
    }

    const issues: string[] = [];
    const title = typeof value.title === "string" && value.title.trim().length > 0
        ? value.title
        : "Untitled note";
    if (title === "Untitled note" && value.title !== title) {
        issues.push("missing title");
    }

    let content: TipTapDocument;
    if (isValidTipTapDocument(value.content)) {
        content = value.content;
    } else if (typeof value.plainText === "string") {
        content = plainTextToTipTapDocument(value.plainText);
        issues.push("invalid document content recovered from plain text");
    } else {
        content = plainTextToTipTapDocument("");
        issues.push("missing document content");
    }

    const plainText = typeof value.plainText === "string"
        ? value.plainText
        : tipTapDocumentToPlainText(content);
    if (typeof value.plainText !== "string") issues.push("missing plain text recovered from content");

    const tags = Array.isArray(value.tags)
        ? value.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
        : [];
    if (!Array.isArray(value.tags)) issues.push("missing tags");

    const subjectId = typeof value.subjectId === "number" && subjectIds.has(value.subjectId)
        ? value.subjectId
        : undefined;
    if (value.subjectId !== undefined && subjectId === undefined) issues.push("invalid subject reference");

    const folderId = typeof value.folderId === "string" && folderIds.has(value.folderId)
        ? value.folderId
        : undefined;
    if (value.folderId !== undefined && folderId === undefined) issues.push("invalid folder reference");

    const createdAt = isValidDateString(value.createdAt) ? value.createdAt : new Date().toISOString();
    const updatedAt = isValidDateString(value.updatedAt) ? value.updatedAt : createdAt;
    if (!isValidDateString(value.createdAt)) issues.push("missing created date recovered");
    if (!isValidDateString(value.updatedAt)) issues.push("missing updated date recovered");

    return {
        note: {
            id: value.id,
            title,
            content,
            plainText,
            ...(subjectId === undefined ? {} : { subjectId }),
            ...(folderId === undefined ? {} : { folderId }),
            tags,
            pinned: typeof value.pinned === "boolean" ? value.pinned : false,
            favourite: typeof value.favourite === "boolean" ? value.favourite : false,
            status: isNoteStatus(value.status) ? value.status : "active",
            createdAt,
            updatedAt,
            linkedNoteIds: Array.isArray(value.linkedNoteIds)
                ? value.linkedNoteIds.filter((id): id is string => typeof id === "string")
                : [],
        },
        issues,
    };
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new NoteStorageError("IndexedDB request failed."));
    });
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new NoteStorageError("IndexedDB transaction failed."));
        tx.onabort = () => reject(tx.error ?? new NoteStorageError("IndexedDB transaction aborted."));
    });
}

function requestAll<T>(store: IDBObjectStore): Promise<T[]> {
    return requestValue(store.getAll() as IDBRequest<T[]>);
}

function validateFolderHierarchy(folders: Folder[], folder: Folder): void {
    if (!folder.parentId) return;
    if (folder.parentId === folder.id) {
        throw new NoteStorageError("A folder cannot be its own parent.");
    }

    const byId = new Map(folders.map((item) => [item.id, item]));
    if (!byId.has(folder.parentId)) {
        throw new NoteStorageError(`Folder "${folder.parentId}" does not exist.`);
    }

    const visited = new Set<string>();
    let currentId: string | undefined = folder.parentId;
    while (currentId) {
        if (currentId === folder.id) {
            throw new NoteStorageError("Folder hierarchy cannot contain a cycle.");
        }
        if (visited.has(currentId)) {
            throw new NoteStorageError("Existing folder hierarchy contains a cycle.");
        }
        visited.add(currentId);
        currentId = byId.get(currentId)?.parentId;
    }
}

async function validateNoteRelations(tx: IDBTransaction, note: Note): Promise<void> {
    const folderRequest = note.folderId
        ? requestValue<Folder | undefined>(tx.objectStore(STORE_FOLDERS).get(note.folderId))
        : Promise.resolve(undefined);
    const subjectRequest = note.subjectId === undefined
        ? Promise.resolve(undefined)
        : requestValue<Subject | undefined>(tx.objectStore(STORE_SUBJECTS).get(note.subjectId));
    const [folder, subject] = await Promise.all([folderRequest, subjectRequest]);

    if (note.folderId && !folder) {
        throw new NoteStorageError(`Folder "${note.folderId}" does not exist.`);
    }
    if (note.subjectId !== undefined && !subject) {
        throw new NoteStorageError(`Subject "${note.subjectId}" does not exist.`);
    }
}

export async function createNote(note: Note): Promise<Note> {
    validateNote(note);
    const db = await openStudyVaultDB();
    const tx = db.transaction([STORE_NOTES, STORE_FOLDERS, STORE_SUBJECTS], "readwrite");
    try {
        await validateNoteRelations(tx, note);
        await requestValue(tx.objectStore(STORE_NOTES).add(note));
        await transactionComplete(tx);
        return note;
    } catch (error) {
        if (error instanceof DOMException && error.name === "ConstraintError") {
            throw new NoteStorageError(`Note "${note.id}" already exists.`);
        }
        throw error;
    }
}

export async function getNote(id: string): Promise<Note | null> {
    requireId(id, "Note");
    const result = await getAllNotesWithIssues();
    return result.notes.find((note) => note.id === id) ?? null;
}

export async function getAllNotes(): Promise<Note[]> {
    return (await getAllNotesWithIssues()).notes;
}

export async function getAllNotesWithIssues(): Promise<NoteLoadResult> {
    const db = await openStudyVaultDB();
    const tx = db.transaction([STORE_NOTES, STORE_FOLDERS, STORE_SUBJECTS], "readonly");
    const [storedNotes, folders, subjects] = await Promise.all([
        requestAll<Record<string, unknown>>(tx.objectStore(STORE_NOTES)),
        requestAll<Folder>(tx.objectStore(STORE_FOLDERS)),
        requestAll<Subject>(tx.objectStore(STORE_SUBJECTS)),
    ]);
    await transactionComplete(tx);

    const folderIds = new Set(folders.map((folder) => folder.id));
    const subjectIds = new Set(subjects.map((subject) => subject.id));
    const issues: NoteLoadIssue[] = [];
    const notes: Note[] = [];

    storedNotes.forEach((stored, index) => {
        const normalized = normalizeStoredNote(stored, folderIds, subjectIds);
        if (!normalized) {
            issues.push({ id: String(stored.id ?? `record-${index + 1}`), message: "missing or invalid note ID" });
            return;
        }
        notes.push(normalized.note);
        if (normalized.issues.length > 0) {
            issues.push({ id: normalized.note.id, message: normalized.issues.join(", ") });
        }
    });

    return {
        notes: notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        issues,
    };
}

export async function updateNote(note: Note): Promise<Note> {
    validateNote(note);
    const db = await openStudyVaultDB();
    const tx = db.transaction([STORE_NOTES, STORE_FOLDERS, STORE_SUBJECTS], "readwrite");
    const store = tx.objectStore(STORE_NOTES);
    await validateNoteRelations(tx, note);
    const existing = await requestValue<Note | undefined>(store.get(note.id));
    if (!existing) {
        tx.abort();
        throw new NoteStorageError(`Note "${note.id}" does not exist.`);
    }
    await requestValue(store.put(note));
    await transactionComplete(tx);
    return note;
}

export async function deleteNote(id: string): Promise<void> {
    requireId(id, "Note");
    const db = await openStudyVaultDB();
    const tx = db.transaction(STORE_NOTES, "readwrite");
    await requestValue(tx.objectStore(STORE_NOTES).delete(id));
    await transactionComplete(tx);
}

export async function createFolder(folder: Folder): Promise<Folder> {
    validateFolder(folder);
    const db = await openStudyVaultDB();
    const tx = db.transaction(STORE_FOLDERS, "readwrite");
    try {
        const folders = await requestAll<Folder>(tx.objectStore(STORE_FOLDERS));
        validateFolderHierarchy(folders, folder);
        await requestValue(tx.objectStore(STORE_FOLDERS).add(folder));
        await transactionComplete(tx);
        return folder;
    } catch (error) {
        if (error instanceof DOMException && error.name === "ConstraintError") {
            throw new NoteStorageError(`Folder "${folder.id}" already exists.`);
        }
        throw error;
    }
}

export async function getAllFolders(): Promise<Folder[]> {
    const db = await openStudyVaultDB();
    const tx = db.transaction(STORE_FOLDERS, "readonly");
    const folders = await requestValue<Folder[]>(tx.objectStore(STORE_FOLDERS).getAll());
    await transactionComplete(tx);
    return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateFolder(folder: Folder): Promise<Folder> {
    validateFolder(folder);
    const db = await openStudyVaultDB();
    const tx = db.transaction(STORE_FOLDERS, "readwrite");
    const store = tx.objectStore(STORE_FOLDERS);
    const existing = await requestValue<Folder | undefined>(store.get(folder.id));
    if (!existing) {
        tx.abort();
        throw new NoteStorageError(`Folder "${folder.id}" does not exist.`);
    }
    const folders = await requestAll<Folder>(store);
    validateFolderHierarchy(
        folders.map((item) => item.id === folder.id ? folder : item),
        folder
    );
    await requestValue(store.put(folder));
    await transactionComplete(tx);
    return folder;
}

/** Delete a folder while moving its notes and child folders to the root. */
export async function deleteFolder(id: string): Promise<void> {
    requireId(id, "Folder");
    const db = await openStudyVaultDB();
    const tx = db.transaction([STORE_FOLDERS, STORE_NOTES], "readwrite");
    const foldersStore = tx.objectStore(STORE_FOLDERS);
    const notesStore = tx.objectStore(STORE_NOTES);
    const folder = await requestValue<Folder | undefined>(foldersStore.get(id));
    if (!folder) {
        tx.abort();
        throw new NoteStorageError(`Folder "${id}" does not exist.`);
    }

    const notes = await requestValue<Note[]>(notesStore.getAll());
    for (const note of notes) {
        if (note.folderId === id) {
            const rootNote = { ...note };
            delete rootNote.folderId;
            notesStore.put(rootNote);
        }
    }

    const folders = await requestValue<Folder[]>(foldersStore.getAll());
    for (const child of folders) {
        if (child.parentId === id) {
            const rootFolder = { ...child };
            delete rootFolder.parentId;
            foldersStore.put(rootFolder);
        }
    }

    await requestValue(foldersStore.delete(id));
    await transactionComplete(tx);
}
