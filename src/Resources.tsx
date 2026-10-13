
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
    ChevronDown,
    Check,
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
    const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
    const [selectedType, setSelectedType] = useState("All");
    const [viewingNote, setViewingNote] = useState<Resource | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const filteredResources = resources.filter((resource) => {
        const matchesSearch =
            resource.title.toLowerCase().includes(search.toLowerCase());

        const matchesSubject =
            selectedSubject === "All" ||
            resource.subjectId === Number(selectedSubject);

        const normalizedType = resource.type.toLowerCase();
        const matchesType = selectedType === "All" ||
            (selectedType === "Document" ? ["document", "doc", "docx"].includes(normalizedType) :
             selectedType === "Other" ? !["note", "pdf", "document", "doc", "docx", "image", "link", "video"].includes(normalizedType) :
             normalizedType === selectedType.toLowerCase());

        return matchesSearch && matchesSubject && matchesType;
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

                    <div className="resource-subject-filter">
                        <button
                            type="button"
                            className="resource-subject-trigger"
                            aria-haspopup="listbox"
                            aria-expanded={subjectMenuOpen}
                            onClick={() => setSubjectMenuOpen((open) => !open)}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") setSubjectMenuOpen(false);
                            }}
                        >
                            <span>{selectedSubject === "All" ? "All subjects" : subjects.find((subject) => String(subject.id) === selectedSubject)?.name ?? "All subjects"}</span>
                            <ChevronDown size={16} className={subjectMenuOpen ? "is-open" : ""} />
                        </button>
                        {subjectMenuOpen && (
                            <>
                                <button
                                    type="button"
                                    className="resource-subject-dismiss"
                                    aria-label="Close subject filter"
                                    tabIndex={-1}
                                    onClick={() => setSubjectMenuOpen(false)}
                                />
                                <div className="resource-subject-menu" role="listbox" aria-label="Filter resources by subject">
                                    <p className="resource-subject-menu-label">FILTER BY SUBJECT</p>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={selectedSubject === "All"}
                                        className={`resource-subject-option ${selectedSubject === "All" ? "selected" : ""}`}
                                        onClick={() => { setSelectedSubject("All"); setSubjectMenuOpen(false); }}
                                    >
                                        <span className="resource-subject-option-mark"><BookOpen size={15} /></span>
                                        <span className="resource-subject-option-copy"><strong>All subjects</strong><small>Show every resource</small></span>
                                        {selectedSubject === "All" && <Check size={16} className="resource-subject-check" />}
                                    </button>
                                    {subjects.map((subject) => {
                                        const value = String(subject.id);
                                        const active = selectedSubject === value;
                                        const count = resources.filter((resource) => resource.subjectId === subject.id).length;
                                        return (
                                            <button
                                                key={subject.id}
                                                type="button"
                                                role="option"
                                                aria-selected={active}
                                                className={`resource-subject-option ${active ? "selected" : ""}`}
                                                onClick={() => { setSelectedSubject(value); setSubjectMenuOpen(false); }}
                                            >
                                                <span className="resource-subject-option-mark"><BookOpen size={15} /></span>
                                                <span className="resource-subject-option-copy"><strong>{subject.name}</strong><small>{count} {count === 1 ? "resource" : "resources"}</small></span>
                                                {active && <Check size={16} className="resource-subject-check" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="resource-type-filters" aria-label="Filter resources by type">
                    {[
                        { value: "All", label: "All" },
                        { value: "Note", label: "Notes" },
                        { value: "PDF", label: "PDF" },
                        { value: "Document", label: "Docs" },
                        { value: "Image", label: "Images" },
                        { value: "Link", label: "Links" },
                        { value: "Video", label: "Videos" },
                        { value: "Other", label: "Others" },
                    ].map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            className={`resource-type-chip ${selectedType === filter.value ? "active" : ""}`}
                            aria-pressed={selectedType === filter.value}
                            onClick={() => setSelectedType(filter.value)}
                        >
                            {filter.label}
                            {filter.value === "All" && <span className="resource-type-chip-count">{resources.length}</span>}
                        </button>
                    ))}
                </div>

                <div className="resources-results-bar">
                    <p className="resources-count">
                        {filteredResources.length} {filteredResources.length === 1 ? "resource" : "resources"} found
                    </p>
                    {(search || selectedSubject !== "All" || selectedType !== "All") && (
                        <button type="button" className="resources-clear-filters" onClick={() => { setSearch(""); setSelectedSubject("All"); setSelectedType("All"); }}>
                            Clear filters
                        </button>
                    )}
                </div>
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
