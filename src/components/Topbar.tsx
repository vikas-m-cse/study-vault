
import {
    Search,
    Bell,
    Plus,
    Command,
} from "lucide-react";

type TopbarProps = {
    onAddResource: () => void;
    onOpenSearch: () => void;
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    onOpenInbox: () => void;
    unreadCount: number;
};

export function Topbar({
    onAddResource,
    onOpenSearch,
    searchQuery,
    onSearchQueryChange,
    onOpenInbox,
    unreadCount,
}: TopbarProps) {
    return (
        <header className="topbar">
            <div className="topbar-ambient" aria-hidden="true" />
            <div className="topbar-search">
                <Search size={18} />

                <input
                    type="search"
                    placeholder="Search your knowledge..."
                    aria-label="Search your knowledge"
                    value={searchQuery}
                    onFocus={onOpenSearch}
                    onChange={(event) => {
                        onOpenSearch();
                        onSearchQueryChange(event.target.value);
                    }}
                />

                <span className="search-shortcut">
                    <Command size={11} /> K
                </span>
                <span className="search-prompt">Search notes, resources, concepts</span>
            </div>

            <div className="topbar-actions">
                <div className="topbar-system">
                    <span className="topbar-system-dot" />
                    <span>LOCAL ENGINE</span>
                </div>

                <button
                    className="icon-button topbar-inbox-button"
                    onClick={onOpenInbox}
                    aria-label={unreadCount > 0 ? `Inbox, ${unreadCount} unread items` : "Open inbox"}
                    title={unreadCount > 0 ? `${unreadCount} unread inbox items` : "Open inbox"}
                >
                    <Bell size={19} />
                    {unreadCount > 0 && <span className="topbar-inbox-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                </button>

                <button
                    className="add-resource-button"
                    onClick={onAddResource}
                >
                    <Plus size={18} />
                    <span>Add resource</span>
                    <kbd>⌘N</kbd>
                </button>
            </div>
        </header>
    );
}
