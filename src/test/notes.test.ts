// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import {
    createFolder,
    createNote,
    deleteFolder,
    getAllFolders,
    getAllNotes,
    getAllNotesWithIssues,
    updateFolder,
    updateNote,
} from "../services/noteStorage";
import { openStudyVaultDB } from "../services/database";
import { saveSubjects } from "../services/storage";
import {
    plainTextToTipTapDocument,
    tipTapDocumentToPlainText,
} from "../services/noteSerialization";

const subject = {
    id: 7,
    name: "Notes testing",
    description: "Subject for note tests",
    color: "blue",
};

function makeNote(id: string, folderId?: string) {
    const content = plainTextToTipTapDocument("first line\nsecond line");
    return {
        id,
        title: "Test note",
        content,
        plainText: tipTapDocumentToPlainText(content),
        ...(folderId ? { folderId } : {}),
        subjectId: subject.id,
        tags: ["testing"],
        pinned: false,
        favourite: false,
        status: "active" as const,
        createdAt: "2026-10-04T00:00:00.000Z",
        updatedAt: "2026-10-04T00:00:00.000Z",
        linkedNoteIds: [],
    };
}

beforeEach(async () => {
    await saveSubjects([subject]);
});

describe("notes and folders storage", () => {
    it("creates, updates, and reloads structured TipTap content", async () => {
        const note = makeNote("note-one");
        await createNote(note);
        const updated = {
            ...note,
            content: plainTextToTipTapDocument("updated content"),
            plainText: "updated content",
            updatedAt: "2026-10-04T01:00:00.000Z",
        };
        await updateNote(updated);

        const reloaded = await getAllNotes();
        expect(reloaded).toHaveLength(1);
        expect(reloaded[0].content.type).toBe("doc");
        expect(reloaded[0].plainText).toBe("updated content");
    });

    it("rejects missing folder and subject references", async () => {
        await expect(createNote(makeNote("missing-folder", "does-not-exist"))).rejects.toThrow();
        await expect(createNote({ ...makeNote("missing-subject"), subjectId: 999 })).rejects.toThrow();
    });

    it("rejects self-parenting and multi-level folder cycles", async () => {
        await expect(createFolder({
            id: "self",
            name: "Self",
            parentId: "self",
            createdAt: new Date().toISOString(),
        })).rejects.toThrow();

        const parent = { id: "parent", name: "Parent", createdAt: new Date().toISOString() };
        const child = { id: "child", name: "Child", parentId: parent.id, createdAt: new Date().toISOString() };
        await createFolder(parent);
        await createFolder(child);
        await expect(updateFolder({ ...parent, parentId: child.id })).rejects.toThrow(/cycle/i);
    });

    it("moves notes and child folders to root when deleting a folder", async () => {
        const parent = { id: "delete-parent", name: "Parent", createdAt: new Date().toISOString() };
        const child = { id: "delete-child", name: "Child", parentId: parent.id, createdAt: new Date().toISOString() };
        await createFolder(parent);
        await createFolder(child);
        await createNote(makeNote("parent-note", parent.id));
        await createNote(makeNote("child-note", child.id));

        await deleteFolder(parent.id);
        const folders = await getAllFolders();
        const notes = await getAllNotes();
        expect(folders.find((folder) => folder.id === parent.id)).toBeUndefined();
        expect(folders.find((folder) => folder.id === child.id)?.parentId).toBeUndefined();
        expect(notes.find((note) => note.id === "parent-note")?.folderId).toBeUndefined();
        expect(notes.find((note) => note.id === "child-note")?.folderId).toBe(child.id);
    });

    it("recovers malformed records in memory and reports issues without rewriting them", async () => {
        const db = await openStudyVaultDB();
        const tx = db.transaction("notes", "readwrite");
        tx.objectStore("notes").put({
            id: "malformed",
            plainText: "recoverable plain text",
            folderId: "missing-folder",
            subjectId: 999,
        });
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        const result = await getAllNotesWithIssues();
        expect(result.notes.find((note) => note.id === "malformed")?.plainText).toBe("recoverable plain text");
        expect(result.notes.find((note) => note.id === "malformed")?.folderId).toBeUndefined();
        expect(result.issues.some((issue) => issue.id === "malformed")).toBe(true);

        const readTx = db.transaction("notes", "readonly");
        const stored = await new Promise<unknown>((resolve, reject) => {
            const request = readTx.objectStore("notes").get("malformed");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        expect(stored).toEqual(expect.objectContaining({ plainText: "recoverable plain text" }));
    });
});

describe("note serialization", () => {
    it("round-trips plain text as paragraphs without HTML interpretation", () => {
        const document = plainTextToTipTapDocument("one\n\nthree");
        expect(document.content).toHaveLength(3);
        expect(tipTapDocumentToPlainText(document)).toBe("one\n\nthree");
    });
});
