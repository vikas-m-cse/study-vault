
import { useEffect, useMemo, useState } from "react";
import {
    BookOpen, Plus, Search, Pencil, Trash2, X,
    SlidersHorizontal, ArrowUpDown, LayoutGrid, List,
    FileText, FolderOpen, ArrowRight, MoreHorizontal,
} from "lucide-react";
import type { Resource } from "./types/resource";

export type Subject = {
    id: number;
    name: string;
    description: string;
    color: string;
};

type SubjectsProps = {
    subjects: Subject[];
    setSubjects: React.Dispatch<React.SetStateAction<Subject[]>>;
    resources: Resource[];
    focusSubjectId?: number | null;
};

const subjectColors = ["blue", "violet", "green", "orange"];

export default function Subjects({
    subjects,
    setSubjects,
    resources,
    focusSubjectId = null,
}: SubjectsProps) {
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
    const [sortMode, setSortMode] = useState<"recent" | "name">("recent");

    const subjectStats = useMemo(() => {
        const map = new Map<number, { notes: number; resources: number }>();
        for (const subject of subjects) map.set(subject.id, { notes: 0, resources: 0 });
        for (const resource of resources) {
            const subjectId = resource.subjectId;
            if (subjectId == null) continue;
            const current = map.get(subjectId);
            if (!current) continue;
            current.resources += 1;
            if (resource.type === "Note") current.notes += 1;
        }
        return map;
    }, [subjects, resources]);

    const filteredSubjects = useMemo(() => {
        const query = search.trim().toLowerCase();
        const result = subjects.filter((subject) =>
            subject.name.toLowerCase().includes(query) ||
            subject.description.toLowerCase().includes(query)
        );
        return sortMode === "name"
            ? [...result].sort((a, b) => a.name.localeCompare(b.name))
            : [...result].sort((a, b) => b.id - a.id);
    }, [subjects, search, sortMode]);

    useEffect(() => {
        if (focusSubjectId === null) return;
        const subjectElement = document.querySelector(`[data-subject-id="${focusSubjectId}"]`);
        subjectElement?.scrollIntoView?.({ block: "center" });
    }, [focusSubjectId, filteredSubjects]);

    const openAddForm = () => {
        setEditingId(null);
        setName("");
        setDescription("");
        setShowForm(true);
    };

    const openEditForm = (subject: Subject) => {
        setEditingId(subject.id);
        setName(subject.name);
        setDescription(subject.description);
        setShowForm(true);
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const cleanName = name.trim();
        if (!cleanName) return;

        if (editingId !== null) {
            setSubjects((current) =>
                current.map((subject) =>
                    subject.id === editingId
                        ? { ...subject, name: cleanName, description: description.trim() }
                        : subject
                )
            );
        } else {
            const newSubject: Subject = {
                id: Date.now(),
                name: cleanName,
                description: description.trim(),
                color: subjectColors[subjects.length % subjectColors.length],
            };

            setSubjects((current) => [...current, newSubject]);
        }

        setShowForm(false);
        setName("");
        setDescription("");
        setEditingId(null);
    };

    const handleDelete = (id: number) => {
        const confirmed = window.confirm(
            "Are you sure you want to delete this subject?"
        );

        if (confirmed) {
            setSubjects((current) =>
                current.filter((subject) => subject.id !== id)
            );
        }
    };

    return (
        <div className="subjects-page">
            <div className="subjects-heading">
                <div>
                    <p className="eyebrow">YOUR LEARNING CATEGORIES</p>
                    <h1>My Subjects</h1>
                    <p className="page-description">
                        Organise your learning by subject.
                    </p>
                </div>

                <button className="primary-button" onClick={openAddForm}>
                    <Plus size={18} />
                    Add subject
                </button>
            </div>

            <div className="subjects-toolbar subjects-toolbar-v2">
                <div className="subjects-search subjects-search-v2">
                    <Search size={18} />
                    <input
                        type="search"
                        placeholder="Search subjects..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                <button className="subjects-filter-button" type="button"><SlidersHorizontal size={14} /><span>All subjects</span></button>
                <button className="subjects-filter-button" type="button" onClick={() => setSortMode((mode) => mode === "recent" ? "name" : "recent")}><ArrowUpDown size={14} /><span>{sortMode === "recent" ? "Recent" : "A–Z"}</span></button>
                <div className="subjects-view-toggle">
                    <button className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")} aria-label="Card view"><LayoutGrid size={15} /></button>
                    <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} aria-label="List view"><List size={15} /></button>
                </div>
                <span className="subjects-count">{filteredSubjects.length} subjects</span>
            </div>

            <div className={`subjects-grid subjects-grid-v2 ${viewMode === "list" ? "list-view" : ""}`}>
                {filteredSubjects.map((subject) => (
                    <article className={`subject-card subject-card-v2 ${subject.color}`} key={subject.id} data-subject-id={subject.id}>
                        <div className="subject-card-art" aria-hidden="true"><span className="art-core" /><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" /><span className="art-orbit orbit-three" /></div>
                        <div className="subject-card-top">
                            <div className={`subject-large-icon ${subject.color}`}><BookOpen size={20} /></div>
                            <div className="subject-card-actions">
                                <button className="subject-action-button" onClick={() => openEditForm(subject)} aria-label={`Edit ${subject.name}`}><Pencil size={15} /></button>
                                <button className="subject-action-button delete-action" onClick={() => handleDelete(subject.id)} aria-label={`Delete ${subject.name}`}><Trash2 size={15} /></button>
                                <button className="subject-action-button" aria-label="More actions"><MoreHorizontal size={15} /></button>
                            </div>
                        </div>
                        <div className="subject-card-copy">
                            <h2>{subject.name}</h2>
                            <p>{subject.description || "No description added yet."}</p>
                        </div>
                        <div className="subject-card-stats">
                            <span><FileText size={12} /> {subjectStats.get(subject.id)?.notes ?? 0} notes</span>
                            <span><FolderOpen size={12} /> {subjectStats.get(subject.id)?.resources ?? 0} resources</span>
                        </div>
                        <div className="subject-card-footer subject-card-footer-v2">
                            <button type="button"><FileText size={13} /> Notes</button>
                            <button type="button"><FolderOpen size={13} /> Resources</button>
                            <button type="button"><span className="mini-stack" /> Flashcards</button>
                            <button className="subject-open-button" type="button" aria-label={`Open ${subject.name}`}><ArrowRight size={15} /></button>
                        </div>
                    </article>
                ))}
            </div>

            {filteredSubjects.length === 0 && (
                <div className="subjects-empty">
                    <BookOpen size={30} />
                    <h3>No subjects found</h3>
                    <p>
                        {search
                            ? "Try another search term."
                            : "Add your first subject to get started."}
                    </p>
                </div>
            )}

            {showForm && (
                <div className="subject-modal-backdrop">
                    <form className="subject-modal" onSubmit={handleSubmit}>
                        <div className="subject-modal-heading">
                            <div>
                                <h2>{editingId !== null ? "Edit subject" : "Add a subject"}</h2>
                                <p>Give your learning space a name and description.</p>
                            </div>

                            <button
                                type="button"
                                className="subject-action-button"
                                onClick={() => setShowForm(false)}
                                aria-label="Close form"
                            >
                                <X size={19} />
                            </button>
                        </div>

                        <label htmlFor="subject-name">Subject name</label>
                        <input
                            id="subject-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="e.g. Operating Systems"
                            required
                            autoFocus
                        />

                        <label htmlFor="subject-description">Description</label>
                        <textarea
                            id="subject-description"
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="What are you learning in this subject?"
                            rows={3}
                        />

                        <div className="subject-modal-actions">
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={() => setShowForm(false)}
                            >
                                Cancel
                            </button>

                            <button type="submit" className="primary-button">
                                {editingId !== null ? "Save changes" : "Create subject"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
