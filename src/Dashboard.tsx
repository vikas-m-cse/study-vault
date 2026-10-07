
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
            <section className="sv-home-hero">
                <div className="sv-hero-copy">
                    <div className="sv-hero-kicker"><span /> PERSONAL LEARNING OS <b>01</b></div>
                    <h1>Build knowledge<br /><em>that stays.</em></h1>
                    <p>Your resources are only the raw material. StudyVault turns them into retrieval, understanding and long-term capability.</p>
                    <div className="sv-hero-actions">
                        <button className="sv-hero-primary" onClick={onAddResource}><Plus size={16} /> Add resource <ArrowUpRight size={14} /></button>
                        <div className="sv-hero-note"><span className="sv-hero-live" /> All data stays on this device</div>
                    </div>
                </div>
                <div className="sv-hero-visual" aria-hidden="true">
                    <div className="sv-orbit orbit-a" />
                    <div className="sv-orbit orbit-b" />
                    <div className="sv-orbit orbit-c" />
                    <div className="sv-core"><BookOpen size={24} /><span>KNOWLEDGE</span></div>
                    <span className="sv-orbit-label label-a">RETRIEVE</span>
                    <span className="sv-orbit-label label-b">UNDERSTAND</span>
                    <span className="sv-orbit-label label-c">TRANSFER</span>
                </div>
            </section>

            <section className="sv-command-strip sv-command-strip-premium">
                <div><span className="sv-strip-index">01</span><b>{resources.length}</b><small>resources</small></div>
                <div><span className="sv-strip-index">02</span><b>{subjects.length}</b><small>subjects</small></div>
                <div><span className="sv-strip-index">03</span><b>{resources.filter(r => r.type === "Note").length}</b><small>notes</small></div>
                <div className="sv-strip-message"><span className="sv-strip-live" /> PRIVATE LOCAL WORKSPACE <span>·</span> READY</div>
            </section>

            <section className="sv-dashboard-intro">
                <div>
                    <span className="sv-section-index">02 / YOUR VAULT</span>
                    <h2>Everything you need,<br /><em>without the noise.</em></h2>
                </div>
                <div className="sv-intro-rule">
                    <span>COLLECT</span><i></i><span>RETRIEVE</span><i></i><span>MASTER</span>
                </div>
            </section>

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
