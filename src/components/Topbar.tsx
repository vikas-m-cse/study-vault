
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
};

export function Topbar({
    onAddResource,
    onOpenSearch,
    searchQuery,
    onSearchQueryChange,
}: TopbarProps) {
    return (
        <header className="topbar">
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
                    <Command size={12} /> K
                </span>
            </div>

            <div className="topbar-actions">
                <button
                    className="icon-button"
                    aria-label="Notifications"
                    title="Notifications"
                >
                    <Bell size={19} />
                </button>

                <button
                    className="add-resource-button"
                    onClick={onAddResource}
                >
                    <Plus size={18} />
                    <span>Add resource</span>
                </button>
            </div>
        </header>
    );
}
