
import {
    BookOpen,
    FileText,
    Star,
    ArrowUpRight,
    Plus,
    ExternalLink,
} from "lucide-react";

import { useState } from "react";
import type { Resource } from "./types/resource";
import type { Subject } from "./Subjects";
import { NoteViewer } from "./components/NoteViewer";

type DashboardProps = {
    resources: Resource[];
    subjects: Subject[];
    onAddResource: () => void;
};

export default function Dashboard({
    resources,
    subjects,
    onAddResource,
}: DashboardProps) {

    const recentResources = resources.slice(0, 5);
    const [viewingNote, setViewingNote] = useState<Resource | null>(null);

    const openResource = (resource: Resource) => {
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

        window.alert(
            `"${resource.title}" is a ${resource.type} resource. ` +
            "The original file is not available in this session. " +
            "Please re-upload the file by editing the resource."
        );
    };

    return (
        <>
        <div className="dashboard">

            {/* Welcome section */}
            <section className="welcome-section">
                <div>
                    <p className="eyebrow">YOUR LEARNING SPACE</p>
                    <h1>Good morning, Vikas.</h1>
                    <p className="welcome-description">
                        Your knowledge, organised in one place.
                    </p>
                </div>

                <button
                    className="primary-button"
                    onClick={onAddResource}
                >
                    <Plus size={18} />
                    Add resource
                </button>
            </section>

            {/* Statistics */}
            <section className="stats-grid">

                <div className="stat-card">
                    <div className="stat-icon blue-icon">
                        <FileText size={20} />
                    </div>
                    <p>Total resources</p>
                    <h2>{resources.length}</h2>
                    <span>Across all subjects</span>
                </div>

                <div className="stat-card">
                    <div className="stat-icon violet-icon">
                        <BookOpen size={20} />
                    </div>
                    <p>Subjects</p>
                    <h2>{subjects.length}</h2>
                    <span>Your learning categories</span>
                </div>

                <div className="stat-card">
                    <div className="stat-icon orange-icon">
                        <Star size={20} />
                    </div>
                    <p>Favourites</p>
                    <h2>0</h2>
                    <span>Quick access collection</span>
                </div>

            </section>

            {/* Main dashboard content */}
            <section className="dashboard-grid">

                {/* Recent resources */}
                <div className="content-card">

                    <div className="section-heading">
                        <div>
                            <h2>Recent resources</h2>
                            <p>Pick up where you left off.</p>
                        </div>
                    </div>

                    <div className="resource-list">

                        {recentResources.length === 0 ? (

                            <div className="empty-resources">
                                <FileText size={30} />
                                <h3>No resources yet</h3>
                                <p>
                                    Add your first PDF, document, link or note.
                                </p>
                                <button
                                    className="primary-button"
                                    onClick={onAddResource}
                                >
                                    <Plus size={17} />
                                    Add your first resource
                                </button>
                            </div>

                        ) : (

                            recentResources.map((resource) => {

                                const subject = subjects.find(
                                    (item) => item.id === resource.subjectId
                                );

                                return (
                                    <div
                                        className="resource-row"
                                        key={resource.id}
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
                                        style={{ cursor: "pointer" }}
                                        title="Click to open resource"
                                    >

                                        <div className="resource-icon">
                                            {resource.type === "Note" ? (
                                                <BookOpen size={20} />
                                            ) : (
                                                <FileText size={20} />
                                            )}
                                        </div>

                                        <div className="resource-info">
                                            <h3>{resource.title}</h3>
                                            <p>
                                                {subject?.name ?? "Unknown subject"}
                                            </p>
                                        </div>

                                        <span className="resource-type">
                                            {resource.type}
                                        </span>

                                        <span className="resource-date">
                                            {new Date(
                                                resource.createdAt
                                            ).toLocaleDateString()}
                                        </span>

                                        <ExternalLink size={16} />

                                    </div>
                                );
                            })

                        )}

                    </div>
                </div>

                {/* Subjects */}
                <div className="content-card subjects-card">

                    <div className="section-heading">
                        <div>
                            <h2>Your subjects</h2>
                            <p>Explore your learning spaces.</p>
                        </div>
                    </div>

                    <div className="subject-list">

                        {subjects.map((subject) => {

                            const count = resources.filter(
                                (resource) =>
                                    resource.subjectId === subject.id
                            ).length;

                            return (
                                <div
                                    className="subject-row"
                                    key={subject.id}
                                >

                                    <div
                                        className={`subject-dot ${subject.color}`}
                                    />

                                    <div className="subject-info">
                                        <h3>{subject.name}</h3>
                                        <p>{count} resources</p>
                                    </div>

                                    <ArrowUpRight size={17} />

                                </div>
                            );
                        })}

                    </div>
                </div>

            </section>
        </div>

        {viewingNote && (
            <NoteViewer
                title={viewingNote.title}
                content={viewingNote.content ?? ""}
                onClose={() => setViewingNote(null)}
            />
        )}
        </>
    );
}
