import { useEffect, useMemo, useRef, useState } from "react";
import {
    Archive,
    BookOpen,
    FileText,
    Folder,
    Pin,
    Search,
    Star,
    Tag,
    X,
} from "lucide-react";
import type { Note } from "../types/note";
import type { Resource } from "../types/resource";
import type { Subject } from "../Subjects";
import { getAllFolders, getAllNotesWithIssues } from "../services/noteStorage";
import { buildSearchIndex, searchIndex, type SearchFilter, type SearchResult } from "../services/search";

type GlobalSearchProps = {
    isOpen: boolean;
    query: string;
    resources: Resource[];
    subjects: Subject[];
    onQueryChange: (query: string) => void;
    onClose: () => void;
    onSelect: (result: SearchResult) => void;
};

function ResultIcon({ type }: { type: SearchResult["type"] }) {
    if (type === "Note") return <FileText size={17} />;
    if (type === "Resource") return <BookOpen size={17} />;
    if (type === "Subject") return <Tag size={17} />;
    return <Folder size={17} />;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
    const cleanQuery = query.trim();
    if (!cleanQuery) return <>{text}</>;

    const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "ig"));
    return (
        <>
            {parts.map((part, index) =>
                part.toLowerCase() === cleanQuery.toLowerCase()
                    ? <mark key={`${part}-${index}`}>{part}</mark>
                    : <span key={`${part}-${index}`}>{part}</span>
            )}
        </>
    );
}

function formatResultMeta(result: SearchResult): string {
    if (result.type === "Note") {
        if (result.legacy) return "Legacy note";
        if (result.status === "archived") return "Archived note";
        return result.folderName ?? result.subjectName ?? "Note";
    }
    if (result.type === "Resource") return [result.resourceType, result.subjectName].filter(Boolean).join(" · ") || "Resource";
    if (result.type === "Subject") return "Subject";
    return "Folder";
}

export function GlobalSearch({
    isOpen,
    query,
    resources,
    subjects,
    onQueryChange,
    onClose,
    onSelect,
}: GlobalSearchProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [folders, setFolders] = useState<Awaited<ReturnType<typeof getAllFolders>>>([]);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filter, setFilter] = useState<SearchFilter>("all");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        if (!isOpen) return;
        inputRef.current?.focus();
        let cancelled = false;
        Promise.all([getAllNotesWithIssues(), getAllFolders()])
            .then(([noteResult, savedFolders]) => {
                if (cancelled) return;
                setNotes(noteResult.notes);
                setFolders(savedFolders);
                if (noteResult.issues.length > 0) {
                    setLoadError("Some saved notes contain recoverable data issues.");
                }
            })
            .catch((error) => {
                if (cancelled) return;
                console.error("[StudyVault] Failed to load global search data:", error);
                setLoadError("Search could not load local notes.");
            })
            .finally(() => {
                if (!cancelled) setHasLoaded(true);
            });

        return () => { cancelled = true; };
    }, [isOpen]);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedQuery(query), 150);
        return () => window.clearTimeout(timer);
    }, [query]);

    const index = useMemo(
        () => buildSearchIndex({ notes, resources, subjects, folders }),
        [folders, notes, resources, subjects]
    );
    const results = useMemo(
        () => searchIndex(index, debouncedQuery, filter),
        [debouncedQuery, filter, index]
    );

    const activeSelectedIndex = results.length === 0
        ? 0
        : Math.min(selectedIndex, results.length - 1);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key === "ArrowDown" && results.length > 0) {
                event.preventDefault();
                setSelectedIndex((current) => (current + 1) % results.length);
            }
            if (event.key === "ArrowUp" && results.length > 0) {
                event.preventDefault();
                setSelectedIndex((current) => (current - 1 + results.length) % results.length);
            }
            if (event.key === "Enter" && results[activeSelectedIndex]) {
                event.preventDefault();
                onSelect(results[activeSelectedIndex]);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeSelectedIndex, isOpen, onClose, onSelect, results]);

    if (!isOpen) return null;

    return (
        <div
            className="global-search-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section className="global-search-dialog" role="dialog" aria-modal="true" aria-label="Search your knowledge">
                <div className="global-search-header">
                    <div className="global-search-input-wrap">
                        <Search size={19} />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(event) => {
                                setSelectedIndex(0);
                                onQueryChange(event.target.value);
                            }}
                            placeholder="Search notes, resources, subjects..."
                            aria-label="Search your knowledge"
                            autoComplete="off"
                        />
                        {query && <button type="button" onClick={() => onQueryChange("")} aria-label="Clear search"><X size={16} /></button>}
                    </div>
                    <button type="button" className="global-search-close" onClick={onClose} aria-label="Close search">
                        <X size={18} />
                    </button>
                </div>

                <div className="global-search-filters" role="tablist" aria-label="Search result filters">
                    {(["all", "notes", "resources", "subjects", "folders"] as SearchFilter[]).map((value) => (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={filter === value}
                            className={filter === value ? "active" : ""}
                            key={value}
                            onClick={() => {
                                setSelectedIndex(0);
                                setFilter(value);
                            }}
                        >
                            {value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="global-search-body">
                    {!hasLoaded ? (
                        <div className="global-search-state"><span className="notes-loading-mark" /><p>Searching your local knowledge...</p></div>
                    ) : !debouncedQuery.trim() ? (
                        <>
                            {loadError && <div className="global-search-warning" role="status"><Archive size={15} />{loadError}</div>}
                            <div className="global-search-state"><Search size={26} /><h3>Search everything you have saved</h3><p>Try a note title, tag, subject, folder, or resource description.</p></div>
                        </>
                    ) : results.length === 0 ? (
                        <>
                            {loadError && <div className="global-search-warning" role="status"><Archive size={15} />{loadError}</div>}
                            <div className="global-search-state"><Search size={26} /><h3>No matches found</h3><p>Try a shorter phrase or switch to All.</p></div>
                        </>
                    ) : (
                        <>
                            {loadError && <div className="global-search-warning" role="status"><Archive size={15} />{loadError}</div>}
                            <div className="global-search-results" role="listbox" aria-label="Search results">
                                {results.map((result, index) => (
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={activeSelectedIndex === index}
                                        className={`global-search-result ${activeSelectedIndex === index ? "selected" : ""}`}
                                        key={`${result.type}-${result.id}`}
                                        onMouseEnter={() => setSelectedIndex(index)}
                                        onClick={() => onSelect(result)}
                                    >
                                        <span className="global-search-result-icon"><ResultIcon type={result.type} /></span>
                                        <span className="global-search-result-main">
                                            <strong><HighlightedText text={result.title} query={debouncedQuery} /></strong>
                                            <span><HighlightedText text={result.preview} query={debouncedQuery} /></span>
                                        </span>
                                        <span className="global-search-result-meta">
                                            <small>{formatResultMeta(result)}</small>
                                            {result.tags?.slice(0, 2).map((tag) => <small key={tag}><Tag size={11} />{tag}</small>)}
                                            {result.pinned && <PinIcon />}
                                            {result.favourite && <Star size={12} fill="currentColor" />}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <footer className="global-search-footer">
                    <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                    <span><kbd>Enter</kbd> Open</span>
                    <span><kbd>Esc</kbd> Close</span>
                </footer>
            </section>
        </div>
    );
}

function PinIcon() {
    return <span className="global-search-pin" aria-label="Pinned"><Pin size={12} fill="currentColor" /></span>;
}
