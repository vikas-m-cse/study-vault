
import { useState } from "react";
import { X, Upload, Link as LinkIcon, FileText, HardDrive, ExternalLink } from "lucide-react";
import { chooseGoogleDriveFile } from "../services/googleDrivePicker";
import type { Resource, ResourceType } from "../types/resource";
import type { Subject } from "../Subjects";

type AddResourceModalProps = {
    subjects: Subject[];
    onClose: () => void;
    onSave: (resource: Resource) => Promise<void>;
    defaultSubjectId?: number;
    /** When provided, the modal operates in edit mode. */
    initialResource?: Resource;
};

export function AddResourceModal({
    subjects,
    onClose,
    onSave,
    defaultSubjectId,
    initialResource,
}: AddResourceModalProps) {
    const isEditing = initialResource !== undefined;

    const [title, setTitle] = useState(initialResource?.title ?? "");
    const [description, setDescription] = useState(initialResource?.description ?? "");
    const [type, setType] = useState<ResourceType>(initialResource?.type ?? "PDF");
    const [subjectId, setSubjectId] = useState(
        initialResource?.subjectId ?? defaultSubjectId ?? subjects[0]?.id ?? 0
    );
    const [file, setFile] = useState<File | null>(initialResource?.file ?? null);
    const [url, setUrl] = useState(initialResource?.url ?? "");
    const [content, setContent] = useState(initialResource?.content ?? "");
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [driveError, setDriveError] = useState<string | null>(null);
    const [isChoosingDriveFile, setIsChoosingDriveFile] = useState(false);
    const [driveFileName, setDriveFileName] = useState<string | null>(null);

    const handleChooseFromDrive = async () => {
        if (isChoosingDriveFile) return;
        setIsChoosingDriveFile(true);
        setDriveError(null);
        try {
            const selected = await chooseGoogleDriveFile();
            if (!selected) return;
            setDriveFileName(selected.name);
            setTitle((current) => current.trim() || selected.name);
            setType("Link");
            setUrl(selected.url || `https://drive.google.com/open?id=${encodeURIComponent(selected.id)}`);
            setDescription((current) => current.trim() || `Google Drive file${selected.mimeType ? ` · ${selected.mimeType}` : ""}`);
        } catch (error) {
            setDriveError(error instanceof Error ? error.message : "Could not open Google Drive.");
        } finally {
            setIsChoosingDriveFile(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSaving) return;

        const cleanTitle = title.trim();

        if (!cleanTitle || !subjectId) return;
        if (type === "Link" && !url.trim()) return;
        if (type === "Note" && !content.trim()) return;

        // In edit mode file upload is optional (keep existing file if no new one chosen)
        if (!isEditing && ["PDF", "Document", "Image"].includes(type) && !file) {
            return;
        }

        const resource: Resource = {
            id: initialResource?.id ?? crypto.randomUUID(),
            title: cleanTitle,
            description: description.trim(),
            type,
            subjectId,
            createdAt: initialResource?.createdAt ?? new Date().toISOString(),
            ...(["PDF", "Document", "Image"].includes(type) && file
                ? { file }
                : ["PDF", "Document", "Image"].includes(type) && initialResource?.file
                ? { file: initialResource.file }
                : {}),
            ...(type === "Link" ? { url: url.trim() } : {}),
            ...(type === "Note" ? { content: content.trim() } : {}),
        };

        setIsSaving(true);
        setSaveError(null);
        try {
            await onSave(resource);
            onClose();
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : "Could not save this resource.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="resource-modal-backdrop">
            <form className="resource-modal" onSubmit={handleSubmit}>
                <div className="resource-modal-heading">
                    <div>
                        <h2>{isEditing ? "Edit resource" : "Add a resource"}</h2>
                        <p>
                            {isEditing
                                ? "Update your resource details."
                                : "Save your learning material in StudyVault."}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="subject-action-button"
                        onClick={onClose}
                        disabled={isSaving}
                        aria-label="Close modal"
                    >
                        <X size={20} />
                    </button>
                </div>

                {saveError && <div className="resource-save-error" role="alert">{saveError}</div>}

                <label htmlFor="resource-title">Resource title</label>
                <input
                    id="resource-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Introduction to Processes"
                    required
                />

                <label htmlFor="resource-description">Description</label>
                <textarea
                    id="resource-description"
                    className="resource-description-field"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What is this resource about? Add a short summary..."
                    rows={4}
                />

                <label htmlFor="resource-subject">Subject</label>
                <select
                    id="resource-subject"
                    value={subjectId}
                    onChange={(event) => setSubjectId(Number(event.target.value))}
                    required
                >
                    {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                            {subject.name}
                        </option>
                    ))}
                </select>

                <label htmlFor="resource-type">Resource type</label>
                <select
                    id="resource-type"
                    value={type}
                    onChange={(event) => {
                        setType(event.target.value as ResourceType);
                        setFile(null);
                        setUrl("");
                        setContent("");
                        setDriveFileName(null);
                    }}
                >
                    <option value="PDF">PDF</option>
                    <option value="Document">Document</option>
                    <option value="Image">Image</option>
                    <option value="Link">Website link</option>
                    <option value="Note">Text note</option>
                </select>

                <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={handleChooseFromDrive}
                        disabled={isChoosingDriveFile || isSaving}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 44, borderColor: "#d7e3d8", color: "#263a5b" }}
                    >
                        <HardDrive size={18} />
                        {isChoosingDriveFile ? "Connecting to Google Drive…" : "Choose from Google Drive"}
                    </button>
                    <p style={{ margin: 0, color: "#718096", fontSize: 12, lineHeight: 1.5 }}>
                        Select a file from your Drive to save a link to it in StudyVault. Drive sharing permissions still apply.
                    </p>
                    {driveFileName && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#2f6b4f", fontSize: 13 }}>
                            <FileText size={16} />
                            <span>{driveFileName}</span>
                            <ExternalLink size={14} />
                        </div>
                    )}
                    {driveError && <div className="resource-save-error" role="alert">{driveError}</div>}
                </div>

                {type === "Link" && (
                    <>
                        <label htmlFor="resource-url">Website URL</label>
                        <div className="resource-input-with-icon">
                            <LinkIcon size={17} />
                            <input
                                id="resource-url"
                                type="url"
                                value={url}
                                onChange={(event) => setUrl(event.target.value)}
                                placeholder="https://example.com"
                                required
                            />
                        </div>
                    </>
                )}

                {type === "Note" && (
                    <>
                        <label htmlFor="resource-content">Note content</label>
                        <textarea
                            id="resource-content"
                            value={content}
                            onChange={(event) => setContent(event.target.value)}
                            placeholder="Write your learning notes here..."
                            rows={6}
                            required
                        />
                    </>
                )}

                {["PDF", "Document", "Image"].includes(type) && (
                    <>
                        <label htmlFor="resource-file">
                            {isEditing ? "Replace file (optional)" : "Choose a file"}
                        </label>

                        <label
                            className="resource-file-picker"
                            htmlFor="resource-file"
                        >
                            <Upload size={21} />
                            <span>
                                {file
                                    ? file.name
                                    : isEditing && initialResource?.file
                                    ? `Current: ${initialResource.file.name}`
                                    : "Click to select a file"}
                            </span>
                            <FileText size={18} />
                        </label>

                        <input
                            id="resource-file"
                            type="file"
                            accept={
                                type === "PDF"
                                    ? ".pdf,application/pdf"
                                    : type === "Image"
                                    ? "image/*"
                                    : ".doc,.docx,.odt,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                            }
                            onChange={(event) =>
                                setFile(event.target.files?.[0] ?? null)
                            }
                                required={!isEditing}
                            hidden
                        />
                    </>
                )}

                <div className="resource-modal-actions">
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        Cancel
                    </button>

                    <button type="submit" className="primary-button" disabled={isSaving}>
                        {isSaving ? "Saving..." : isEditing ? "Save changes" : "Save resource"}
                    </button>
                </div>
            </form>
        </div>
    );
}
