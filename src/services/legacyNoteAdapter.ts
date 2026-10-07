import type { Note } from "../types/note";
import type { Resource } from "../types/resource";
import {
    plainTextToTipTapDocument,
    tipTapDocumentToPlainText,
} from "./noteSerialization";

/** Return true when a resource is one of the application's original text notes. */
export function isLegacyNoteResource(resource: Resource): boolean {
    return resource.type === "Note";
}

/**
 * Convert a legacy Resource note to a Note in memory only.
 * The original resource is never written, changed, or deleted.
 */
export function legacyResourceToNote(resource: Resource): Note | null {
    if (!isLegacyNoteResource(resource)) return null;

    const content = plainTextToTipTapDocument(resource.content ?? "");
    const plainText = tipTapDocumentToPlainText(content);

    return {
        id: resource.id,
        title: resource.title,
        content,
        plainText,
        ...(resource.subjectId !== undefined ? { subjectId: resource.subjectId } : {}),
        tags: [],
        pinned: false,
        favourite: false,
        status: "active",
        createdAt: resource.createdAt,
        updatedAt: resource.createdAt,
        linkedNoteIds: [],
    };
}
