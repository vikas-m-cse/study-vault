
import { useEffect, useMemo, useState } from "react";
import {
    BookOpen,
    Plus,
    Search,
    Pencil,
    Trash2,
    X,
} from "lucide-react";

export type Subject = {
    id: number;
    name: string;
    description: string;
    color: string;
};

type SubjectsProps = {
    subjects: Subject[];
    setSubjects: React.Dispatch<React.SetStateAction<Subject[]>>;
    focusSubjectId?: number | null;
};

const subjectColors = ["blue", "violet", "green", "orange"];

export default function Subjects({
    subjects,
    setSubjects,
    focusSubjectId = null,
}: SubjectsProps) {
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    const filteredSubjects = useMemo(() => {
        return subjects.filter((subject) =>
            subject.name.toLowerCase().includes(search.toLowerCase())
        );
    }, [subjects, search]);

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

            <div className="subjects-toolbar">
                <div className="subjects-search">
                    <Search size={18} />
                    <input
                        type="search"
                        placeholder="Search subjects..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                <span>{filteredSubjects.length} subjects</span>
            </div>

            <div className="subjects-grid">
                {filteredSubjects.map((subject) => (
                    <article className="subject-card" key={subject.id} data-subject-id={subject.id}>
                        <div className="subject-card-top">
                            <div className={`subject-large-icon ${subject.color}`}>
                                <BookOpen size={22} />
                            </div>

                            <div className="subject-card-actions">
                                <button
                                    className="subject-action-button"
                                    onClick={() => openEditForm(subject)}
                                    aria-label={`Edit ${subject.name}`}
                                    title="Edit subject"
                                >
                                    <Pencil size={16} />
                                </button>

                                <button
                                    className="subject-action-button delete-action"
                                    onClick={() => handleDelete(subject.id)}
                                    aria-label={`Delete ${subject.name}`}
                                    title="Delete subject"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        <h2>{subject.name}</h2>
                        <p>{subject.description || "No description added yet."}</p>

                        <div className="subject-card-footer">
                            <span>Subject workspace</span>
                            <BookOpen size={16} />
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
