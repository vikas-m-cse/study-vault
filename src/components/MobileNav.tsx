import { useState } from "react";
import {
  LayoutDashboard, BookOpen, FolderOpen, FileText, Star,
  BrainCircuit, TrendingUp, CalendarDays, Settings, MoreHorizontal, X,
} from "lucide-react";

type MobileNavProps = {
  activePage: string;
  onNavigate: (page: string) => void;
};

const primaryItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Subjects", icon: BookOpen },
  { label: "My Resources", shortLabel: "Resources", icon: FolderOpen },
  { label: "Notes", icon: FileText },
];

const moreItems = [
  { label: "Favourites", icon: Star },
  { label: "Review", icon: BrainCircuit },
  { label: "Progress", icon: TrendingUp },
  { label: "Timetable", icon: CalendarDays },
  { label: "Settings", icon: Settings },
];

export function MobileNav({ activePage, onNavigate }: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isMoreActive = moreItems.some((item) => item.label === activePage);

  const choose = (page: string) => {
    onNavigate(page);
    setMoreOpen(false);
  };

  return (
    <div className="mobile-navigation-wrap">
      {moreOpen && (
        <>
          <button className="mobile-more-backdrop" aria-label="Close navigation menu" onClick={() => setMoreOpen(false)} />
          <nav className="mobile-more-menu" aria-label="More pages">
            <div className="mobile-more-heading">
              <span>MORE IN STUDYVAULT</span>
              <button type="button" aria-label="Close menu" onClick={() => setMoreOpen(false)}><X size={18} /></button>
            </div>
            {moreItems.map(({ label, icon: Icon }) => (
              <button key={label} type="button" className={`mobile-more-item ${activePage === label ? "active" : ""}`} onClick={() => choose(label)}>
                <Icon size={19} strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {primaryItems.map(({ label, shortLabel, icon: Icon }) => (
          <button key={label} type="button" className={`mobile-nav-item ${activePage === label ? "active" : ""}`} aria-current={activePage === label ? "page" : undefined} onClick={() => choose(label)}>
            <Icon size={20} strokeWidth={activePage === label ? 2.2 : 1.8} />
            <span>{shortLabel ?? label}</span>
          </button>
        ))}
        <button type="button" className={`mobile-nav-item ${isMoreActive || moreOpen ? "active" : ""}`} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
          {moreOpen ? <X size={20} /> : <MoreHorizontal size={20} />}
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
