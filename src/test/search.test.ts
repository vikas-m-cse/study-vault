import { describe, expect, it } from "vitest";
import { buildSearchIndex, searchIndex } from "../services/search";
import { plainTextToTipTapDocument } from "../services/noteSerialization";
import type { Note } from "../types/note";
import type { Resource } from "../types/resource";
import type { Subject } from "../Subjects";

const subjects: Subject[] = [
    { id: 1, name: "Operating Systems", description: "Processes and memory", color: "blue" },
    { id: 2, name: "Mathematics", description: "Calculus", color: "green" },
];

const folders = [
    { id: "folder-os", name: "OS Revision", createdAt: "2026-10-04T00:00:00.000Z" },
];

function note(id: string, title: string, plainText: string, tags: string[] = []): Note {
    return {
        id,
        title,
        content: plainTextToTipTapDocument(plainText),
        plainText,
        subjectId: 1,
        folderId: "folder-os",
        tags,
        pinned: false,
        favourite: false,
        status: "active",
        createdAt: "2026-10-04T00:00:00.000Z",
        updatedAt: "2026-10-04T00:00:00.000Z",
        linkedNoteIds: [],
    };
}

const resources: Resource[] = [
    {
        id: "resource-1",
        title: "Memory Management Guide",
        description: "A practical PDF guide",
        type: "PDF",
        subjectId: 1,
        createdAt: "2026-10-04T00:00:00.000Z",
    },
    {
        id: "legacy-1",
        title: "Legacy Processes Note",
        description: "Old note",
        type: "Note",
        subjectId: 1,
        createdAt: "2026-10-04T00:00:00.000Z",
        content: "Legacy process content",
    },
];

const index = buildSearchIndex({
    notes: [note("note-1", "Memory Architecture", "A long content phrase about scheduling", ["kernel"])],
    resources,
    subjects,
    folders,
});

describe("global search ranking and indexing", () => {
    it("prioritizes exact and prefix title matches", () => {
        const results = searchIndex(index, "Memory Architecture");
        expect(results[0].type).toBe("Note");
        expect(results[0].score).toBe(1000);

        const prefix = searchIndex(index, "Memory");
        expect(prefix[0].title).toBe("Memory Architecture");
        expect(prefix[0].score).toBe(800);
    });

    it("matches case-insensitively in content and tags", () => {
        expect(searchIndex(index, "SCHEDULING").some((result) => result.id === "note-1")).toBe(true);
        expect(searchIndex(index, "KERNEL").some((result) => result.id === "note-1")).toBe(true);
    });

    it("searches descriptions, subjects, folders, and legacy notes", () => {
        expect(searchIndex(index, "practical")[0].id).toBe("resource-1");
        expect(searchIndex(index, "mathematics")[0].type).toBe("Subject");
        expect(searchIndex(index, "revision")[0].type).toBe("Folder");
        expect(searchIndex(index, "legacy process")[0].legacy).toBe(true);
    });

    it("supports type filters and empty/no-result states", () => {
        expect(searchIndex(index, "memory", "notes").every((result) => result.type === "Note")).toBe(true);
        expect(searchIndex(index, "kernel", "resources")).toHaveLength(0);
        expect(searchIndex(index, "")).toHaveLength(0);
        expect(searchIndex(index, "not-a-real-match")).toHaveLength(0);
    });

    it("does not duplicate a legacy note when a persisted note has the same ID", () => {
        const persisted = note("legacy-1", "Converted legacy note", "Converted content");
        const deduplicated = buildSearchIndex({ notes: [persisted], resources, subjects, folders });
        const matches = deduplicated.filter((result) => result.id === "legacy-1");
        expect(matches).toHaveLength(1);
        expect(matches[0].legacy).toBeFalsy();
    });
});
