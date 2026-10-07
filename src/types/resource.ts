
export type ResourceType = "PDF" | "Document" | "Image" | "Link" | "Note";

export type Resource = {
    id: string;
    title: string;
    description: string;
    type: ResourceType;
    subjectId: number;
    createdAt: string;

    // Used for uploaded files
    file?: File;

    // Used for website links
    url?: string;

    // Used for text notes
    content?: string;
};
