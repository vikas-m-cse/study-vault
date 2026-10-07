
export type NoteStatus = "active" | "archived" | "trash";

export type TipTapMark = {
    type: string;
    attrs?: Record<string, unknown>;
};

export type TipTapNode = {
    type: string;
    attrs?: Record<string, unknown>;
    text?: string;
    marks?: TipTapMark[];
    content?: TipTapNode[];
};

export type TipTapDocument = {
    type: "doc";
    content: TipTapNode[];
};

export type Note = {
    id: string;
    title: string;
    /** Structured Tiptap JSON content stored directly in IndexedDB. */
    content: TipTapDocument;
    plainText: string;
    subjectId?: number;
    folderId?: string;
    tags: string[];
    pinned: boolean;
    favourite: boolean;
    status: NoteStatus;
    createdAt: string;
    updatedAt: string;
    /** IDs of notes this note explicitly links to. */
    linkedNoteIds: string[];
};

export type Folder = {
    id: string;
    name: string;
    parentId?: string;
    createdAt: string;
};

export type NoteMetadata = Pick<
    Note,
    "id" | "title" | "subjectId" | "folderId" | "tags" | "pinned" | "favourite" | "status" | "createdAt" | "updatedAt"
>;
