import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Archive,
    BrainCircuit,
    Sparkles,
    ChevronLeft,
    ChevronRight,
    Clock3,
    FileText,
    Folder,
    FolderPlus,
    Heart,
    Menu,
    Maximize2,
    Minimize2,
    Pin,
    Plus,
    Search,
    Tags,
    Trash2,
    X,
} from "lucide-react";
import { NoteEditor, type NoteEditorChange } from "./components/NoteEditor";
import StudyToolsModal from "./components/StudyToolsModal";
import type { Note, Folder as NoteFolder } from "./types/note";
import type { Resource } from "./types/resource";
import type { Subject } from "./Subjects";
import {
    createFolder,
    createNote,
    deleteNote,
    getAllFolders,
    getAllNotesWithIssues,
    updateNote,
} from "./services/noteStorage";
import { legacyResourceToNote } from "./services/legacyNoteAdapter";
import { plainTextToTipTapDocument } from "./services/noteSerialization";

type NotesProps = {
    resources: Resource[];
    subjects: Subject[];
    openNoteId?: string;
    openFolderId?: string;
    initialFilter?: NotesFilter;
    onOpenReview?: (noteId: string) => void;
};

type NotesFilter = "all" | "pinned" | "favourites" | "recent" | "archived" | "trash" | `folder:${string}` | `tag:${string}`;
type SaveState = "saved" | "saving" | "error";
type NoteRecord = { note: Note; legacy: boolean };
type Drafts = Record<string, Note>;

function formatUpdatedDate(date: string): string {
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return "Unknown date";

    return value.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: value.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });
}

function formatPreview(text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    return compact || "No content yet";
}

function noteMatchesSearch(note: Note, search: string): boolean {
    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return [note.title, note.plainText, note.tags.join(" ")].some((value) =>
        value.toLowerCase().includes(query)
    );
}

export default function Notes({ resources, subjects, openNoteId, openFolderId, initialFilter = "all", onOpenReview }: NotesProps) {
    const [notes, setNotes] = useState<Note[]>([]);
    const [folders, setFolders] = useState<NoteFolder[]>([]);
    const [drafts, setDrafts] = useState<Drafts>({});
    const [selectedId, setSelectedId] = useState<string | null>(() => openNoteId ?? null);
    const [filter, setFilter] = useState<NotesFilter>(initialFilter);
    const [search, setSearch] = useState("");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
    const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [leftOpen, setLeftOpen] = useState(true);
    const [rightOpen, setRightOpen] = useState(true);
    const [isFolderFormOpen, setIsFolderFormOpen] = useState(false);
    const [folderName, setFolderName] = useState("");
    const [workspaceNow] = useState(() => Date.now());
    const [studyToolsOpen, setStudyToolsOpen] = useState(false);
    const [isNotesFullscreen, setIsNotesFullscreen] = useState(false);
    const workspaceRef = useRef<HTMLDivElement | null>(null);

    const toggleNotesFullscreen = useCallback(async () => {
        const workspace = workspaceRef.current;
        if (!workspace) return;

        try {
            if (document.fullscreenElement === workspace) {
                await document.exitFullscreen();
            } else {
                await workspace.requestFullscreen();
            }
        } catch (error) {
            console.error("[StudyVault] Notes fullscreen unavailable:", error);
        }
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsNotesFullscreen(document.fullscreenElement === workspaceRef.current);
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    const saveTimers = useRef<Record<string, number>>({});
    const saveVersions = useRef<Record<string, number>>({});
    const mountedRef = useRef(true);

    useEffect(() => {
        let cancelled = false;

        async function loadNotes() {
            try {
                const [noteResult, savedFolders] = await Promise.all([
                    getAllNotesWithIssues(),
                    getAllFolders(),
                ]);
                if (cancelled) return;
                setNotes(noteResult.notes);
                setFolders(savedFolders);
                if (openFolderId && savedFolders.some((folder) => folder.id === openFolderId)) {
                    setFilter(`folder:${openFolderId}`);
                }
                if (openNoteId && noteResult.notes.some((note) => note.id === openNoteId)) {
                    setFilter("all");
                    setSelectedId(openNoteId);
                }
                setLoadError(noteResult.issues.length > 0
                    ? `${noteResult.issues.length} saved note${noteResult.issues.length === 1 ? " has" : "s have"} recoverable data issues. Existing records were left unchanged.`
                    : null);
            } catch (error) {
                if (cancelled) return;
                console.error("[StudyVault] Failed to load Notes workspace:", error);
                setLoadError("Notes could not be loaded from local storage.");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadNotes();
        return () => { cancelled = true; };
    }, [openFolderId, openNoteId]);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const legacyRecords = useMemo<NoteRecord[]>(() => {
        return resources
            .map((resource) => legacyResourceToNote(resource))
            .filter((note): note is Note => note !== null)
            .map((note) => ({ note, legacy: true }));
    }, [resources]);

    const visibleRecords = useMemo<NoteRecord[]>(() => {
        const byId = new Map<string, NoteRecord>();
        notes.forEach((note) => byId.set(note.id, {
            note: drafts[note.id] ?? note,
            legacy: false,
        }));
        legacyRecords.forEach(({ note }) => {
            if (!byId.has(note.id)) byId.set(note.id, { note, legacy: true });
        });
        return Array.from(byId.values());
    }, [drafts, legacyRecords, notes]);

    const activeRecords = useMemo(() => {
        const cutoff = workspaceNow - 30 * 24 * 60 * 60 * 1000;
        return visibleRecords
            .filter(({ note }) => {
                if (filter === "archived") return note.status === "archived";
                if (filter === "trash") return note.status === "trash";
                if (note.status !== "active") return false;
                if (filter === "pinned") return note.pinned;
                if (filter === "favourites") return note.favourite;
                if (filter === "recent") return new Date(note.updatedAt).getTime() >= cutoff;
                if (filter.startsWith("folder:")) return note.folderId === filter.slice(7);
                if (filter.startsWith("tag:")) return note.tags.includes(filter.slice(4));
                return true;
            })
            .filter(({ note }) => noteMatchesSearch(note, search))
            .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));
    }, [filter, search, visibleRecords, workspaceNow]);

    const effectiveSelectedId = selectedId && activeRecords.some(({ note }) => note.id === selectedId)
        ? selectedId
        : activeRecords[0]?.note.id ?? null;
    const selectedRecord = activeRecords.find(({ note }) => note.id === effectiveSelectedId) ?? null;
    const selectedNote = selectedRecord
        ? drafts[selectedRecord.note.id] ?? selectedRecord.note
        : null;

    const folderById = useMemo(
        () => new Map(folders.map((folder) => [folder.id, folder])),
        [folders]
    );

    const tags = useMemo(() => {
        const uniqueTags = new Set<string>();
        visibleRecords.forEach(({ note }) => note.tags.forEach((tag) => uniqueTags.add(tag)));
        return Array.from(uniqueTags).sort((a, b) => a.localeCompare(b));
    }, [visibleRecords]);

    const persistDraft = useCallback((note: Note) => {
        const nextVersion = (saveVersions.current[note.id] ?? 0) + 1;
        saveVersions.current[note.id] = nextVersion;
        setSaveStates((current) => ({ ...current, [note.id]: "saving" }));
        setSaveErrors((current) => {
            if (!(note.id in current)) return current;
            const next = { ...current };
            delete next[note.id];
            return next;
        });

        const existingTimer = saveTimers.current[note.id];
        if (existingTimer !== undefined) window.clearTimeout(existingTimer);

        saveTimers.current[note.id] = window.setTimeout(async () => {
            try {
                await updateNote(note);
                if (saveVersions.current[note.id] !== nextVersion) return;
                if (!mountedRef.current) return;
                setNotes((current) => current.map((item) => item.id === note.id ? note : item));
                setDrafts((current) => {
                    if (!(note.id in current)) return current;
                    const next = { ...current };
                    delete next[note.id];
                    return next;
                });
                setSaveStates((current) => ({ ...current, [note.id]: "saved" }));
            } catch (error) {
                if (saveVersions.current[note.id] !== nextVersion) return;
                if (!mountedRef.current) return;
                console.error("[StudyVault] Failed to autosave note:", error);
                setSaveStates((current) => ({ ...current, [note.id]: "error" }));
                setSaveErrors((current) => ({
                    ...current,
                    [note.id]: "Could not save this note locally.",
                }));
            }
        }, 700);
    }, []);

    const updateSelectedNote = useCallback((patch: Partial<Note>) => {
        if (!selectedNote || selectedRecord?.legacy) return;
        const nextNote: Note = {
            ...selectedNote,
            ...patch,
            updatedAt: new Date().toISOString(),
        };
        setDrafts((current) => ({ ...current, [nextNote.id]: nextNote }));
        persistDraft(nextNote);
    }, [persistDraft, selectedNote, selectedRecord?.legacy]);

    const handleEditorChange = useCallback((change: NoteEditorChange) => {
        updateSelectedNote(change);
    }, [updateSelectedNote]);

    const createNewNote = async () => {
        const now = new Date().toISOString();
        const note: Note = {
            id: crypto.randomUUID(),
            title: "Untitled note",
            content: plainTextToTipTapDocument(""),
            plainText: "",
            tags: [],
            pinned: false,
            favourite: false,
            status: "active",
            createdAt: now,
            updatedAt: now,
            linkedNoteIds: [],
        };

        try {
            await createNote(note);
            setNotes((current) => [note, ...current]);
            setSelectedId(note.id);
            setFilter("all");
            setSaveStates((current) => ({ ...current, [note.id]: "saved" }));
            setLoadError(null);
        } catch (error) {
            console.error("[StudyVault] Failed to create note:", error);
            setLoadError("The new note could not be created locally.");
        }
    };

    const createNewFolder = async () => {
        const name = folderName.trim();
        if (!name) return;
        const folder: NoteFolder = {
            id: crypto.randomUUID(),
            name: name.trim(),
            createdAt: new Date().toISOString(),
        };

        try {
            await createFolder(folder);
            setFolders((current) => [...current, folder].sort((a, b) => a.name.localeCompare(b.name)));
            setFilter(`folder:${folder.id}`);
            setFolderName("");
            setIsFolderFormOpen(false);
        } catch (error) {
            console.error("[StudyVault] Failed to create folder:", error);
            setLoadError("The folder could not be created locally.");
        }
    };

    const convertLegacyNote = async () => {
        if (!selectedRecord?.legacy) return;
        const source = resources.find((resource) => resource.id === selectedRecord.note.id);
        if (!source) return;
        const converted = legacyResourceToNote(source);
        if (!converted) return;

        try {
            await createNote(converted);
            setNotes((current) => [converted, ...current]);
            setSelectedId(converted.id);
            setLoadError(null);
        } catch (error) {
            console.error("[StudyVault] Failed to migrate legacy note:", error);
            setLoadError("This legacy note could not be made editable.");
        }
    };

    const saveState = selectedNote ? saveStates[selectedNote.id] ?? "saved" : "saved";
    const wordCount = selectedNote?.plainText.trim()
        ? selectedNote.plainText.trim().split(/\s+/).length
        : 0;

    const statusLabel = selectedRecord?.legacy
        ? "Legacy note · Read only"
        : saveState === "saving"
        ? "Saving..."
        : saveState === "error"
        ? "Save error"
        : "Saved locally";

    const renderFilterButton = (
        value: NotesFilter,
        label: string,
        icon: React.ReactNode,
        count?: number
    ) => (
        <button
            type="button"
            className={`notes-nav-item ${filter === value ? "active" : ""}`}
            onClick={() => setFilter(value)}
        >
            {icon}
            <span>{label}</span>
            {count !== undefined && <small>{count}</small>}
        </button>
    );

    return (
        <div className="notes-page">
            <div className="notes-page-heading">
                <div>
                    <p className="eyebrow">YOUR KNOWLEDGE STUDIO</p>
                    <h1>Notes</h1>
                    <p className="page-description">Think clearly, connect ideas, and keep your best work close.</p>
                </div>
                <div className="notes-heading-actions">
                    <button
                        type="button"
                        className="notes-panel-toggle"
                        onClick={() => setLeftOpen((current) => !current)}
                        aria-label={leftOpen ? "Hide notes navigation" : "Show notes navigation"}
                        title={leftOpen ? "Hide notes navigation" : "Show notes navigation"}
                    >
                        {leftOpen ? <ChevronLeft size={17} /> : <Menu size={17} />}
                    </button>
                    <button className="primary-button" type="button" onClick={createNewNote}>
                        <Plus size={17} />
                        New note
                    </button>
                </div>
            </div>

            {loadError && <div className="notes-error" role="alert">{loadError}</div>}

            <div
                ref={workspaceRef}
                className={`notes-workspace ${leftOpen ? "left-open" : "left-closed"} ${rightOpen ? "right-open" : "right-closed"} ${isNotesFullscreen ? "is-fullscreen" : ""}`}
            >
                <aside className="notes-panel notes-left-panel" aria-label="Notes navigation">
                    <div className="notes-panel-heading">
                        <div>
                            <span className="notes-panel-kicker">LIBRARY</span>
                            <h2>Explore</h2>
                        </div>
                        <button
                            type="button"
                            className="notes-panel-close"
                            onClick={() => setLeftOpen(false)}
                            aria-label="Collapse notes navigation"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    </div>

                    <nav className="notes-nav-list">
                        {renderFilterButton("all", "All notes", <FileText size={16} />, visibleRecords.filter(({ note }) => note.status === "active").length)}
                        {renderFilterButton("pinned", "Pinned", <Pin size={16} />, visibleRecords.filter(({ note }) => note.status === "active" && note.pinned).length)}
                        {renderFilterButton("favourites", "Favourites", <Heart size={16} />, visibleRecords.filter(({ note }) => note.status === "active" && note.favourite).length)}
                        {renderFilterButton("recent", "Recently edited", <Clock3 size={16} />)}
                        {renderFilterButton("archived", "Archived", <Archive size={16} />, visibleRecords.filter(({ note }) => note.status === "archived").length)}
                        {renderFilterButton("trash", "Trash", <Trash2 size={16} />, visibleRecords.filter(({ note }) => note.status === "trash").length)}
                    </nav>

                    <div className="notes-left-section">
                        <div className="notes-section-label">
                            <span>FOLDERS</span>
                            <button type="button" onClick={() => setIsFolderFormOpen((current) => !current)} aria-label="Create folder" title="Create folder">
                                <FolderPlus size={15} />
                            </button>
                        </div>
                        {isFolderFormOpen && (
                            <form
                                className="notes-folder-form"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void createNewFolder();
                                }}
                            >
                                <input
                                    value={folderName}
                                    onChange={(event) => setFolderName(event.target.value)}
                                    placeholder="Folder name"
                                    aria-label="New folder name"
                                    autoFocus
                                />
                                <button type="submit" aria-label="Save folder" title="Save folder"><Plus size={14} /></button>
                                <button type="button" onClick={() => { setFolderName(""); setIsFolderFormOpen(false); }} aria-label="Cancel folder" title="Cancel folder"><X size={14} /></button>
                            </form>
                        )}
                        {folders.length === 0 ? (
                            <p className="notes-muted-copy">No folders yet</p>
                        ) : (
                            <div className="notes-folder-list">
                                {folders.map((folder) => (
                                    <button
                                        type="button"
                                        className={`notes-nav-item ${filter === `folder:${folder.id}` ? "active" : ""}`}
                                        key={folder.id}
                                        onClick={() => setFilter(`folder:${folder.id}`)}
                                    >
                                        <Folder size={15} />
                                        <span>{folder.name}</span>
                                        <small>{visibleRecords.filter(({ note }) => note.folderId === folder.id && note.status === "active").length}</small>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="notes-left-section">
                        <div className="notes-section-label"><span>TAGS</span><Tags size={15} /></div>
                        {tags.length === 0 ? (
                            <p className="notes-muted-copy">Tags appear as you add them</p>
                        ) : (
                            <div className="notes-tag-list">
                                {tags.map((tag) => (
                                    <button
                                        type="button"
                                        className={`notes-tag-filter ${filter === `tag:${tag}` ? "active" : ""}`}
                                        key={tag}
                                        onClick={() => setFilter(`tag:${tag}`)}
                                    >
                                        <span>#</span>{tag}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                <section className="notes-panel notes-list-panel" aria-label="Notes list">
                    <div className="notes-list-header">
                        <div className="notes-search-field">
                            <Search size={16} />
                            <input
                                type="search"
                                placeholder="Search notes"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                aria-label="Search notes"
                            />
                            {search && (
                                <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                                    <X size={15} />
                                </button>
                            )}
                        </div>
                        <div className="notes-list-summary">
                            <span>{activeRecords.length} {activeRecords.length === 1 ? "note" : "notes"}</span>
                            {!leftOpen && <button type="button" onClick={() => setLeftOpen(true)} aria-label="Show notes navigation"><ChevronRight size={15} /></button>}
                        </div>
                    </div>

                    <div className="notes-list-scroll">
                        {isLoading ? (
                            <div className="notes-empty-state"><span className="notes-loading-mark" /><p>Loading your notes...</p></div>
                        ) : activeRecords.length === 0 ? (
                            <div className="notes-empty-state">
                                <FileText size={28} />
                                <h3>{search ? "No notes found" : "Your notes start here"}</h3>
                                <p>{search ? "Try a different search or filter." : "Capture a thought, plan, or idea in your local workspace."}</p>
                                {!search && <button type="button" className="primary-button" onClick={createNewNote}><Plus size={16} />Create your first note</button>}
                            </div>
                        ) : (
                            activeRecords.map(({ note, legacy }) => {
                                const currentNote = drafts[note.id] ?? note;
                                const folderName = currentNote.folderId ? folderById.get(currentNote.folderId)?.name : undefined;
                                return (
                                    <button
                                        type="button"
                                        className={`notes-list-item ${effectiveSelectedId === note.id ? "selected" : ""}`}
                                        key={note.id}
                                        onClick={() => setSelectedId(note.id)}
                                    >
                                        <div className="notes-list-item-heading">
                                            <h3>{currentNote.title || "Untitled note"}</h3>
                                            {currentNote.pinned && <Pin size={13} fill="currentColor" />}
                                        </div>
                                        <p>{formatPreview(currentNote.plainText)}</p>
                                        <div className="notes-list-item-meta">
                                            <span>{formatUpdatedDate(currentNote.updatedAt)}</span>
                                            {folderName && <span><Folder size={12} />{folderName}</span>}
                                            {legacy && <span className="notes-legacy-mark">Legacy</span>}
                                        </div>
                                        {currentNote.tags.length > 0 && <div className="notes-list-item-tags">{currentNote.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </section>

                <section className="notes-panel notes-editor-panel" aria-label="Note editor">
                    {selectedNote ? (
                        <>
                            <div className="notes-editor-header">
                                <div className="notes-editor-breadcrumb">
                                    <span>{selectedNote.folderId ? folderById.get(selectedNote.folderId)?.name ?? "Notes" : "All notes"}</span>
                                    <ChevronRight size={14} />
                                    <span>{selectedRecord?.legacy ? "Legacy note" : "Editor"}</span>
                                </div>
                                <div className="notes-editor-header-actions">
                                    <span className={`notes-save-status ${saveState}`}>{statusLabel}</span>
                                    <button
                                        type="button"
                                        className="notes-fullscreen-button"
                                        onClick={() => void toggleNotesFullscreen()}
                                        aria-label={isNotesFullscreen ? "Exit fullscreen notes" : "Open notes in fullscreen"}
                                        title={isNotesFullscreen ? "Exit fullscreen" : "Open note in fullscreen"}
                                    >
                                        {isNotesFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                                        <span>{isNotesFullscreen ? "Exit focus" : "Focus"}</span>
                                    </button>
                                    {selectedNote && !selectedRecord?.legacy && (
                                        <button
                                            type="button"
                                            className="notes-study-tools-button"
                                            onClick={() => setStudyToolsOpen(true)}
                                            title="Transform this note into study material"
                                        >
                                            <Sparkles size={15} />
                                            Study tools
                                        </button>
                                    )}
                                    {selectedNote && !selectedRecord?.legacy && onOpenReview && (
                                        <button
                                            type="button"
                                            className="notes-review-button"
                                            onClick={() => onOpenReview(selectedNote.id)}
                                            title="Review this note now"
                                        >
                                            <BrainCircuit size={15} />
                                            Review this note
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="notes-panel-toggle"
                                        onClick={() => setRightOpen((current) => !current)}
                                        aria-label={rightOpen ? "Collapse editor" : "Expand editor"}
                                        title={rightOpen ? "Collapse editor" : "Expand editor"}
                                    >
                                        {rightOpen ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
                                    </button>
                                </div>
                            </div>

                            <div className="notes-editor-scroll">
                                <div className="notes-title-row">
                                    <input
                                        className="notes-title-input"
                                        value={selectedNote.title}
                                        readOnly={selectedRecord?.legacy}
                                        onChange={(event) => updateSelectedNote({ title: event.target.value })}
                                        aria-label="Note title"
                                    />
                                    <div className="notes-note-actions">
                                        <button
                                            type="button"
                                            className={`notes-round-action ${selectedNote.pinned ? "active" : ""}`}
                                            onClick={() => updateSelectedNote({ pinned: !selectedNote.pinned })}
                                            disabled={selectedRecord?.legacy}
                                            aria-label={selectedNote.pinned ? "Unpin note" : "Pin note"}
                                            title={selectedNote.pinned ? "Unpin note" : "Pin note"}
                                        >
                                            <Pin size={17} fill={selectedNote.pinned ? "currentColor" : "none"} />
                                        </button>
                                        <button
                                            type="button"
                                            className={`notes-round-action ${selectedNote.favourite ? "active" : ""}`}
                                            onClick={() => updateSelectedNote({ favourite: !selectedNote.favourite })}
                                            disabled={selectedRecord?.legacy}
                                            aria-label={selectedNote.favourite ? "Remove from favourites" : "Add to favourites"}
                                            title={selectedNote.favourite ? "Remove from favourites" : "Add to favourites"}
                                        >
                                            <Heart size={17} fill={selectedNote.favourite ? "currentColor" : "none"} />
                                        </button>
                                    </div>
                                </div>

                                <div className="notes-metadata-grid">
                                    <label>
                                        <span>Subject</span>
                                        <select
                                            value={selectedNote.subjectId ?? ""}
                                            disabled={selectedRecord?.legacy}
                                            onChange={(event) => updateSelectedNote({ subjectId: event.target.value ? Number(event.target.value) : undefined })}
                                        >
                                            <option value="">No subject</option>
                                            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                                        </select>
                                    </label>
                                    <label>
                                        <span>Folder</span>
                                        <select
                                            value={selectedNote.folderId ?? ""}
                                            disabled={selectedRecord?.legacy}
                                            onChange={(event) => updateSelectedNote({ folderId: event.target.value || undefined })}
                                        >
                                            <option value="">Root notes</option>
                                            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                                        </select>
                                    </label>
                                </div>

                                <label className="notes-tags-field">
                                    <span>Tags</span>
                                    <input
                                        value={selectedNote.tags.join(", ")}
                                        readOnly={selectedRecord?.legacy}
                                        placeholder="Add tags separated by commas"
                                        onChange={(event) => updateSelectedNote({
                                            tags: event.target.value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).filter((tag, index, all) => all.indexOf(tag) === index),
                                        })}
                                    />
                                </label>

                                {selectedRecord?.legacy && (
                                    <div className="notes-legacy-banner">
                                        <div>
                                            <strong>This note is from My Resources.</strong>
                                            <span>Make an editable copy in Notes without changing the original resource.</span>
                                        </div>
                                        <button type="button" className="secondary-button" onClick={convertLegacyNote}>Make editable</button>
                                    </div>
                                )}

                                <NoteEditor
                                    key={`${selectedNote.id}-${selectedRecord?.legacy ? "legacy" : "editable"}`}
                                    content={selectedNote.content}
                                    readOnly={selectedRecord?.legacy}
                                    onChange={handleEditorChange}
                                />

                                {saveState === "error" && <p className="notes-save-error" role="alert">{saveErrors[selectedNote.id] ?? "Save failed. Your edits remain in this session."}</p>}
                            </div>

                            <div className="notes-editor-footer">
                                <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
                                <span>Updated {formatUpdatedDate(selectedNote.updatedAt)}</span>
                                {!selectedRecord?.legacy && (
                                    <div className="notes-status-actions">
                                        {selectedNote.status === "trash" ? (
                                            <>
                                                <button type="button" onClick={() => updateSelectedNote({ status: "active" })} title="Restore note"><Archive size={15} />Restore</button>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        if (!window.confirm(`Delete "${selectedNote.title}" permanently?`)) return;
                                                        try {
                                                            await deleteNote(selectedNote.id);
                                                            setNotes((current) => current.filter((note) => note.id !== selectedNote.id));
                                                            setSelectedId(null);
                                                        } catch {
                                                            setSaveErrors((current) => ({ ...current, [selectedNote.id]: "Could not permanently delete this note." }));
                                                        }
                                                    }}
                                                    title="Delete note permanently"
                                                ><Trash2 size={15} />Delete permanently</button>
                                            </>
                                        ) : (
                                            <>
                                                <button type="button" onClick={() => updateSelectedNote({ status: "archived" })} title="Archive note"><Archive size={15} />Archive</button>
                                                <button type="button" onClick={() => updateSelectedNote({ status: "trash" })} title="Move note to trash"><Trash2 size={15} />Trash</button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="notes-editor-empty">
                            <FileText size={32} />
                            <h2>Select a note</h2>
                            <p>Choose a note from your library or create a new one.</p>
                            <button type="button" className="primary-button" onClick={createNewNote}><Plus size={16} />New note</button>
                        </div>
                    )}
                </section>
            </div>
            {studyToolsOpen && selectedNote && !selectedRecord?.legacy && (
                <StudyToolsModal note={selectedNote} onClose={() => setStudyToolsOpen(false)} />
            )}
        </div>
    );
}
