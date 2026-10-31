
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

    /** Private Supabase Storage object path for cross-device attachment retrieval. */
    cloudFilePath?: string;

    // Used for website links
    url?: string;

    // Used for text notes
    content?: string;
};
