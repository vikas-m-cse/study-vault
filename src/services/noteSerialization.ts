import type { TipTapDocument, TipTapNode } from "../types/note";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isTipTapNode(value: unknown): value is TipTapNode {
    if (!isRecord(value) || typeof value.type !== "string" || value.type.length === 0) {
        return false;
    }

    if ("text" in value && typeof value.text !== "string") {
        return false;
    }

    if ("content" in value) {
        if (!Array.isArray(value.content) || !value.content.every(isTipTapNode)) {
            return false;
        }
    }

    if ("marks" in value) {
        if (!Array.isArray(value.marks)) return false;
        if (!value.marks.every((mark) => {
            if (!isRecord(mark) || typeof mark.type !== "string") return false;
            return !("attrs" in mark) || isRecord(mark.attrs);
        })) {
            return false;
        }
    }

    return true;
}

/** Validate the minimum document shape required by the Notes 2.0 store. */
export function isValidTipTapDocument(value: unknown): value is TipTapDocument {
    return isRecord(value)
        && value.type === "doc"
        && Array.isArray(value.content)
        && value.content.every(isTipTapNode);
}

/** Throw a typed error when a value is not a valid TipTap document. */
export function validateTipTapDocument(value: unknown): asserts value is TipTapDocument {
    if (!isValidTipTapDocument(value)) {
        throw new Error("Invalid TipTap document.");
    }
}

/** Convert plain text into paragraph nodes without interpreting markup or HTML. */
export function plainTextToTipTapDocument(text: string): TipTapDocument {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");

    return {
        type: "doc",
        content: text.length === 0
            ? []
            : lines.map((line) => ({
                type: "paragraph",
                ...(line.length > 0 ? { content: [{ type: "text", text: line }] } : {}),
            })),
    };
}

function extractNodeText(node: TipTapNode): string {
    if (node.type === "text") return node.text ?? "";

    const children = (node.content ?? []).map(extractNodeText);
    const isBlock = node.type === "doc"
        || node.type === "paragraph"
        || node.type === "heading"
        || node.type === "blockquote"
        || node.type === "listItem"
        || node.type === "taskItem"
        || node.type === "codeBlock";

    return children.join(isBlock ? "\n" : "");
}

/** Extract searchable plain text from a validated TipTap document. */
export function tipTapDocumentToPlainText(document: TipTapDocument): string {
    validateTipTapDocument(document);
    return extractNodeText(document).replace(/\n+$/g, "");
}
