
import {
    LayoutDashboard,
    BookOpen,
    FolderOpen,
    FileText,
    Star,
    BrainCircuit,
    Settings,
    Library,
} from "lucide-react";

type SidebarProps = {
    activePage: string;
    onNavigate: (page: string) => void;
};

const navigationItems = [
    {
        label: "Dashboard",
        icon: LayoutDashboard,
    },
    {
        label: "Subjects",
        icon: BookOpen,
    },
    {
        label: "My Resources",
        icon: FolderOpen,
    },
    {
        label: "Notes",
        icon: FileText,
    },
    {
        label: "Favourites",
        icon: Star,
    },
    {
        label: "Review",
        icon: BrainCircuit,
    },
];

export function Sidebar({
    activePage,
    onNavigate,
}: SidebarProps) {
    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <div className="brand-icon">
                    <Library size={22} />
                </div>

                <div className="brand-text">
                    <h2>StudyVault</h2>
                    <span>Your learning space</span>
                </div>
            </div>

            <div className="sidebar-section">
                <p className="sidebar-label">WORKSPACE</p>

                <nav className="sidebar-navigation">
                    {navigationItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activePage === item.label;

                        return (
                            <button
                                key={item.label}
                                className={`nav-item ${isActive ? "active" : ""
                                    }`}
                                onClick={() => onNavigate(item.label)}
                                aria-pressed={isActive}
                            >
                                <Icon size={19} strokeWidth={1.8} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            <div className="sidebar-bottom">
                <button
                    className="nav-item"
                    onClick={() => onNavigate("Settings")}
                    aria-pressed={activePage === "Settings"}
                >
                    <Settings size={19} strokeWidth={1.8} />
                    <span>Settings</span>
                </button>

                <div className="sidebar-footer">
                    <div className="user-avatar">V</div>
                    <div>
                        <strong>My Workspace</strong>
                        <span>Personal account</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
