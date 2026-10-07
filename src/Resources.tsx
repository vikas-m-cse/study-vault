
import {
    FileText,
    BookOpen,
    ExternalLink,
    Search,
    Plus,
    Pencil,
    Trash2,
    Image as ImageIcon,
    Link as LinkIcon,
} from "lucide-react";

import { useCallback, useEffect, useState } from "react";
import type { Resource } from "./types/resource";
import type { Subject } from "./Subjects";
import { NoteViewer } from "./components/NoteViewer";

type ResourcesProps = {
    resources: Resource[];
    subjects: Subject[];
    onAddResource: () => void;
    onEditResource: (resource: Resource) => void;
    onDeleteResource: (id: string) => Promise<void>;
    focusResourceId?: string | null;
};

function ResourceIcon({ type }: { type: Resource["type"] }) {
    switch (type) {
        case "Note":
            return <BookOpen size={20} />;
        case "Image":
            return <ImageIcon size={20} />;
        case "Link":
            return <LinkIcon size={20} />;
        default:
            return <FileText size={20} />;
    }
}

export default function Resources({
    resources,
    subjects,
    onAddResource,
    onEditResource,
    onDeleteResource,
    focusResourceId = null,
}: ResourcesProps) {
    const [search, setSearch] = useState("");
    const [selectedSubject, setSelectedSubject] = useState("All");
    const [viewingNote, setViewingNote] = useState<Resource | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const filteredResources = resources.filter((resource) => {
        const matchesSearch =
            resource.title.toLowerCase().includes(search.toLowerCase());

        const matchesSubject =
            selectedSubject === "All" ||
            resource.subjectId === Number(selectedSubject);

        return matchesSearch && matchesSubject;
    });

    const openResource = useCallback((resource: Resource) => {
        if (resource.type === "Note") {
            setViewingNote(resource);
            return;
        }

        if (resource.file) {
            const fileUrl = URL.createObjectURL(resource.file);
            window.open(fileUrl, "_blank", "noopener,noreferrer");
            window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
            return;
        }

        if (resource.url) {
            window.open(resource.url, "_blank", "noopener,noreferrer");
            return;
        }

        // Fallback: file was not persisted (uploaded in a previous session)
        window.alert(
            `"${resource.title}" is a ${resource.type} resource. ` +
            "The original file is not available in this session. " +
            "Please re-upload the file by editing the resource."
        );
    }, []);

    useEffect(() => {
        if (!focusResourceId) return;
        const resource = resources.find((item) => item.id === focusResourceId);
        if (!resource) return;
        const timer = window.setTimeout(() => openResource(resource), 0);
        return () => window.clearTimeout(timer);
    }, [focusResourceId, openResource, resources]);

    const handleDelete = async (resource: Resource) => {
        const confirmed = window.confirm(
            `Delete "${resource.title}"? This cannot be undone.`
        );
        if (confirmed) {
            try {
                setActionError(null);
                await onDeleteResource(resource.id);
            } catch (error) {
                setActionError(error instanceof Error ? error.message : "Could not delete this resource.");
            }
        }
    };

    return (
        <div className="resources-page">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">YOUR KNOWLEDGE LIBRARY</p>
                    <h1>My Resources</h1>
                    <p className="page-description">
                        All your learning materials, organised in one place.
                    </p>
                </div>

                <button className="primary-button" onClick={onAddResource}>
                    <Plus size={18} />
                    Add resource
                </button>
            </div>

            <div className="content-card">
                {actionError && <div className="resource-save-error" role="alert">{actionError}</div>}
                <div className="resources-toolbar">
                    <div className="resource-search">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Search your resources..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>

                    <select
                        value={selectedSubject}
                        onChange={(event) =>
                            setSelectedSubject(event.target.value)
                        }
                    >
                        <option value="All">All subjects</option>
                        {subjects.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                                {subject.name}
                            </option>
                        ))}
                    </select>
                </div>

                <p className="resources-count">
                    {filteredResources.length} resource
                    {filteredResources.length !== 1 ? "s" : ""} found
                </p>

                {filteredResources.length === 0 ? (
                    <div className="empty-resources">
                        <FileText size={32} />
                        <h3>
                            {resources.length === 0
                                ? "Your library is empty"
                                : "No matching resources"}
                        </h3>
                        <p>
                            {resources.length === 0
                                ? "Add your first PDF, document, link or note."
                                : "Try another search or subject filter."}
                        </p>

                        {resources.length === 0 && (
                            <button
                                className="primary-button"
                                onClick={onAddResource}
                            >
                                <Plus size={17} />
                                Add your first resource
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="resources-library-list">
                        {filteredResources.map((resource) => {
                            const subject = subjects.find(
                                (item) => item.id === resource.subjectId
                            );

                            return (
                                <div
                                    className="resource-row resource-row--library"
                                    key={resource.id}
                                >
                                    {/* Clickable open area */}
                                    <div
                                        className="resource-row-main"
                                        onClick={() => openResource(resource)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === "Enter" ||
                                                event.key === " "
                                            ) {
                                                event.preventDefault();
                                                openResource(resource);
                                            }
                                        }}
                                        title="Click to open resource"
                                    >
                                        <div className="resource-icon">
                                            <ResourceIcon type={resource.type} />
                                        </div>

                                        <div className="resource-info">
                                            <h3>{resource.title}</h3>
                                            <p>
                                                {subject?.name ?? "Unknown subject"}
                                                {resource.description
                                                    ? ` · ${resource.description}`
                                                    : ""}
                                            </p>
                                        </div>

                                        <span className="resource-type">
                                            {resource.type}
                                        </span>

                                        <ExternalLink size={16} className="resource-open-icon" />
                                    </div>

                                    {/* Action buttons */}
                                    <div className="resource-row-actions">
                                        <button
                                            className="subject-action-button"
                                            onClick={() => onEditResource(resource)}
                                            aria-label={`Edit ${resource.title}`}
                                            title="Edit resource"
                                        >
                                            <Pencil size={15} />
                                        </button>

                                        <button
                                            className="subject-action-button delete-action"
                                            onClick={() => handleDelete(resource)}
                                            aria-label={`Delete ${resource.title}`}
                                            title="Delete resource"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {viewingNote && (
                <NoteViewer
                    title={viewingNote.title}
                    content={viewingNote.content ?? ""}
                    onClose={() => setViewingNote(null)}
                />
            )}
        </div>
    );
}
