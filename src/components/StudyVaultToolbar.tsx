import { useEffect, useRef, useState } from "react";
import {
    BookOpen, CalendarDays, FilePlus2, Grip, Search, Timer, X, ChevronRight, StickyNote,
} from "lucide-react";
import "./studyvault-toolbar.css";

type Props = {
    activePage: string;
    onNavigate: (page: string) => void;
    onAddResource: () => void;
    onOpenSearch: () => void;
};

type Position = { x: number; y: number };

const STORAGE_KEY = "studyvault-floating-toolbar-position-v1";
const shortcuts = [
    { label: "Search anything", icon: Search, action: "search", detail: "Find notes, resources and subjects" },
    { label: "Add a resource", icon: FilePlus2, action: "add", detail: "Save a file or Drive link" },
    { label: "Open notes", icon: StickyNote, page: "Notes", detail: "Return to your writing" },
    { label: "Start a focus session", icon: Timer, page: "Focus Cockpit", detail: "Get into deep work" },
    { label: "Open today's plan", icon: CalendarDays, page: "Timetable", detail: "See what to work on next" },
];

function clampPosition(position: Position): Position {
    const margin = 12;
    const width = window.innerWidth < 520 ? 56 : 60;
    const height = 60;
    return {
        x: Math.max(margin, Math.min(position.x, window.innerWidth - width - margin)),
        y: Math.max(margin + 48, Math.min(position.y, window.innerHeight - height - margin - 24)),
    };
}

export default function StudyVaultToolbar({ activePage, onNavigate, onAddResource, onOpenSearch }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [position, setPosition] = useState<Position>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved) as Position;
        } catch { /* use the default position */ }
        return { x: typeof window === "undefined" ? 24 : window.innerWidth - 78, y: 180 };
    });
    const [dragging, setDragging] = useState(false);
    const drag = useRef<{ pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);

    useEffect(() => {
        const resize = () => setPosition((current) => clampPosition(current));
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, []);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(position)); } catch { /* position remains usable for this session */ }
    }, [position]);

    const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        drag.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!drag.current) return;
        const dx = event.clientX - drag.current.pointerX;
        const dy = event.clientY - drag.current.pointerY;
        if (Math.abs(dx) + Math.abs(dy) > 5) {
            drag.current.moved = true;
            setDragging(true);
            setPosition(clampPosition({ x: drag.current.x + dx, y: drag.current.y + dy }));
        }
    };

    const onPointerUp = () => {
        if (drag.current?.moved) {
            suppressClick.current = true;
            window.setTimeout(() => { suppressClick.current = false; }, 0);
        }
        drag.current = null;
        setDragging(false);
    };

    const runShortcut = (item: typeof shortcuts[number]) => {
        if (item.action === "add") onAddResource();
        else if (item.action === "search") onOpenSearch();
        else if (item.page) onNavigate(item.page);
        setExpanded(false);
    };

    return (
        <div className={`sv-floating-toolbar ${expanded ? "is-expanded" : ""} ${dragging ? "is-dragging" : ""}`} style={{ left: position.x, top: position.y }}>
            {expanded && (
                <div className="sv-toolbar-panel" role="menu" aria-label="StudyVault quick access">
                    <div className="sv-toolbar-panel-head">
                        <div><span>STUDYVAULT / TOOLS</span><strong>Quick tools</strong></div>
                        <button type="button" className="sv-toolbar-close" onClick={() => setExpanded(false)} aria-label="Close quick access"><X size={16}/></button>
                    </div>
                    <div className="sv-toolbar-grid">
                        {shortcuts.map((item) => {
                            const Icon = item.icon;
                            const selected = item.page === activePage;
                            return (
                                <button type="button" role="menuitem" key={item.label} className={`sv-toolbar-action ${selected ? "is-active" : ""}`} onClick={() => runShortcut(item)}>
                                    <span><Icon size={17}/></span><div className="sv-toolbar-action-copy"><strong>{item.label}</strong><small>{item.detail}</small></div><ChevronRight size={13}/>
                                </button>
                            );
                        })}
                    </div>
                    <p className="sv-toolbar-hint">A small tool dock for your workflow. Drag the book grip to move it.</p>
                </div>
            )}
            <button
                type="button"
                className="sv-toolbar-handle"
                aria-label={expanded ? "Close StudyVault quick access" : "Open StudyVault quick access; drag to move"}
                aria-expanded={expanded}
                title="StudyVault quick access · drag to move"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClick={() => {
                    if (suppressClick.current) return;
                    setExpanded((value) => !value);
                }}
            >
                <span className="sv-toolbar-mark"><BookOpen size={19}/></span>
                <Grip size={15} className="sv-toolbar-grip"/>
            </button>
        </div>
    );
}
