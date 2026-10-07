
import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { GlobalSearch } from "./components/GlobalSearch";
import Dashboard from "./Dashboard";
import Resources from "./Resources";
import Notes from "./Notes";
import { AddResourceModal } from "./components/AddResourceModal";
import type { Resource } from "./types/resource";
import type { SearchResult } from "./services/search";
import Subjects, { type Subject } from "./Subjects";
import Review from "./Review";
import {
    isStorageAvailable,
    loadResources,
    loadSubjects,
    saveResource,
    saveSubjects,
    deleteResource as dbDeleteResource,
} from "./services/storage";
import "./App.css";

// ---------------------------------------------------------------------------
// Default subjects shown on first launch (before any user data is saved)
// ---------------------------------------------------------------------------

const DEFAULT_SUBJECTS: Subject[] = [
    {
        id: 1,
        name: "Operating Systems",
        description: "Processes, memory management and operating system concepts.",
        color: "blue",
    },
    {
        id: 2,
        name: "Object Oriented Programming",
        description: "Java, classes, objects, inheritance and polymorphism.",
        color: "violet",
    },
    {
        id: 3,
        name: "Data Structures",
        description: "Algorithms, linked lists, stacks, queues and trees.",
        color: "green",
    },
    {
        id: 4,
        name: "Mathematics",
        description: "Linear algebra, calculus and mathematical foundations.",
        color: "orange",
    },
];

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
    const [activePage, setActivePage] = useState("Dashboard");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [notesTarget, setNotesTarget] = useState<{ noteId?: string; folderId?: string } | null>(null);
    const [resourceTargetId, setResourceTargetId] = useState<string | null>(null);
    const [subjectTargetId, setSubjectTargetId] = useState<number | null>(null);
    const storageAvailable = isStorageAvailable();

    // null = still loading from IndexedDB
    const [subjects, setSubjects] = useState<Subject[] | null>(
        () => storageAvailable ? null : DEFAULT_SUBJECTS
    );
    const [resources, setResources] = useState<Resource[] | null>(
        () => storageAvailable ? null : []
    );

    const [isAddResourceOpen, setIsAddResourceOpen] = useState(false);
    const [editingResource, setEditingResource] = useState<Resource | null>(null);
    const [storageError, setStorageError] = useState<string | null>(
        () => storageAvailable
            ? null
            : "Your browser does not support IndexedDB. Data will not be saved between sessions."
    );

    // -----------------------------------------------------------------------
    // Load persisted data on mount
    // -----------------------------------------------------------------------

    useEffect(() => {
        if (!storageAvailable) return;

        let cancelled = false;

        async function loadData() {
            try {
                const [savedSubjects, savedResources] = await Promise.all([
                    loadSubjects(),
                    loadResources(),
                ]);

                if (cancelled) return;

                // Use saved subjects; fall back to defaults on first launch
                setSubjects(savedSubjects.length > 0 ? savedSubjects : DEFAULT_SUBJECTS);
                setResources(savedResources);
            } catch (err) {
                if (cancelled) return;
                console.error("[StudyVault] Failed to load from IndexedDB:", err);
                setStorageError(
                    "Could not load saved data. Your work this session will not be persisted."
                );
                setSubjects(DEFAULT_SUBJECTS);
                setResources([]);
            }
        }

        loadData();
        return () => { cancelled = true; };
    }, [storageAvailable]);

    // -----------------------------------------------------------------------
    // Persist subjects whenever they change (skip initial null)
    // -----------------------------------------------------------------------

    useEffect(() => {
        if (subjects === null) return;
        if (!isStorageAvailable()) return;

        saveSubjects(subjects).catch((err) => {
            console.error("[StudyVault] Failed to save subjects:", err);
        });
    }, [subjects]);

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setIsSearchOpen(true);
            }
        };
        window.addEventListener("keydown", handleShortcut);
        return () => window.removeEventListener("keydown", handleShortcut);
    }, []);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const handleAddResource = useCallback(() => {
        setEditingResource(null);
        setIsAddResourceOpen(true);
    }, []);

    const handleEditResource = useCallback((resource: Resource) => {
        setEditingResource(resource);
        setIsAddResourceOpen(true);
    }, []);

    const handleSaveResource = useCallback(async (savedResource: Resource) => {
        if (!isStorageAvailable()) {
            throw new Error("IndexedDB is unavailable. This resource was not saved.");
        }

        try {
            await saveResource(savedResource);
        } catch (err) {
            console.error("[StudyVault] Failed to persist resource:", err);
            throw new Error("StudyVault could not save this resource locally.", { cause: err });
        }

        setResources((previous) => {
            if (previous === null) return [savedResource];

            const exists = previous.some((r) => r.id === savedResource.id);
            return exists
                ? previous.map((r) => (r.id === savedResource.id ? savedResource : r))
                : [savedResource, ...previous];
        });
        setIsAddResourceOpen(false);
        setEditingResource(null);
    }, []);

    const handleDeleteResource = useCallback(async (id: string) => {
        if (!isStorageAvailable()) {
            throw new Error("IndexedDB is unavailable. This resource was not deleted.");
        }

        try {
            await dbDeleteResource(id);
        } catch (err) {
            console.error("[StudyVault] Failed to delete resource from IndexedDB:", err);
            throw new Error("StudyVault could not delete this resource locally.", { cause: err });
        }

        setResources((previous) =>
            previous ? previous.filter((r) => r.id !== id) : previous
        );
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsAddResourceOpen(false);
        setEditingResource(null);
    }, []);

    const handleSetSubjects: React.Dispatch<React.SetStateAction<Subject[]>> = useCallback(
        (action) => {
            setSubjects((prev) => {
                const current = prev ?? DEFAULT_SUBJECTS;
                return typeof action === "function" ? action(current) : action;
            });
        },
        []
    );

    const handleSearchSelect = useCallback((result: SearchResult) => {
        setSearchQuery("");
        setIsSearchOpen(false);

        if (result.type === "Note") {
            setNotesTarget(result.legacy ? { noteId: result.id } : { noteId: result.id });
            setActivePage("Notes");
        } else if (result.type === "Resource") {
            setResourceTargetId(result.id);
            setActivePage("My Resources");
        } else if (result.type === "Subject") {
            setSubjectTargetId(Number(result.id));
            setActivePage("Subjects");
        } else {
            setNotesTarget({ folderId: result.id });
            setActivePage("Notes");
        }
    }, []);

    // -----------------------------------------------------------------------
    // Loading guard — show nothing until IndexedDB data is ready
    // -----------------------------------------------------------------------

    if (subjects === null || resources === null) {
        return (
            <div className="app-layout">
                <div className="app-loading">
                    <p>Loading StudyVault…</p>
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className="app-layout">
            <Sidebar activePage={activePage} onNavigate={setActivePage} />

            <main className="main-content">
                <Topbar
                    onAddResource={handleAddResource}
                    onOpenSearch={() => setIsSearchOpen(true)}
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                />

                {storageError && (
                    <div className="storage-error-banner" role="alert">
                        <span>⚠ {storageError}</span>
                    </div>
                )}

                <section className="page-content">
                    {activePage === "Dashboard" ? (
                        <Dashboard
                            resources={resources}
                            subjects={subjects}
                            onAddResource={handleAddResource}
                        />
                    ) : activePage === "Subjects" ? (
                        <Subjects
                            subjects={subjects}
                            setSubjects={handleSetSubjects}
                            focusSubjectId={subjectTargetId}
                        />
                    ) : activePage === "My Resources" ? (
                        <Resources
                            resources={resources}
                            subjects={subjects}
                            onAddResource={handleAddResource}
                            onEditResource={handleEditResource}
                            onDeleteResource={handleDeleteResource}
                            focusResourceId={resourceTargetId}
                        />
                    ) : activePage === "Notes" ? (
                        <Notes
                            resources={resources}
                            subjects={subjects}
                            openNoteId={notesTarget?.noteId}
                            openFolderId={notesTarget?.folderId}
                        />
                    ) : activePage === "Favourites" ? (
                        <Notes
                            resources={resources}
                            subjects={subjects}
                            initialFilter="favourites"
                        />
                    ) : activePage === "Review" ? (
                        <Review
                            resources={resources}
                            subjects={subjects}
                        />
                    ) : (
                        <div className="page-heading">
                            <p className="eyebrow">YOUR PERSONAL WORKSPACE</p>
                            <h1>{activePage}</h1>
                            <p className="page-description">
                                Your learning resources, organised in one place.
                            </p>
                        </div>
                    )}
                </section>
            </main>

            {isAddResourceOpen && (
                <AddResourceModal
                    subjects={subjects}
                    onClose={handleCloseModal}
                    onSave={handleSaveResource}
                    initialResource={editingResource ?? undefined}
                />
            )}

            <GlobalSearch
                isOpen={isSearchOpen}
                query={searchQuery}
                resources={resources}
                subjects={subjects}
                onQueryChange={setSearchQuery}
                onClose={() => {
                    setIsSearchOpen(false);
                    setSearchQuery("");
                }}
                onSelect={handleSearchSelect}
            />
        </div>
    );
}

export default App;
