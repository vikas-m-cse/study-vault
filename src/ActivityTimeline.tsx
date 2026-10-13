import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, BookOpen, CalendarCheck,
  CheckCircle2, Clock3, Filter, NotebookPen, Search, Sparkles,
} from "lucide-react";
import { getLearningEvents } from "./services/learningCore";
import { readPlannerHistory } from "./services/plannerHistory";
import { buildActivityTimeline, type ActivityEntry, type ActivityKind, type ActivityReflection } from "./services/activityTimeline";
import "./activity-timeline.css";

type FilterKind = "all" | ActivityKind;
type RangeKind = "7" | "30" | "all";

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function iconFor(kind: ActivityKind) {
  if (kind === "planner") return <CalendarCheck size={17} />;
  if (kind === "review") return <BookOpen size={17} />;
  if (kind === "reflection") return <NotebookPen size={17} />;
  return <Clock3 size={17} />;
}

function dateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function readSchedules(): Record<string, { nextReviewAt?: number; lastReviewedAt?: number }> {
  return safeRead("studyvault-review-v2", {});
}

export default function ActivityTimeline({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [kind, setKind] = useState<FilterKind>("all");
  const [range, setRange] = useState<RangeKind>("30");
  const [query, setQuery] = useState("");
  const [now] = useState(() => Date.now());

  const refresh = useCallback(() => {
    const reflections = safeRead<Record<string, ActivityReflection>>("studyvault-weekly-reflections-v1", {});
    setEntries(buildActivityTimeline(
      readPlannerHistory(),
      getLearningEvents(),
      Object.entries(reflections).map(([weekKey, value]) => ({ ...value, weekKey })),
      readSchedules(),
    ));
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = () => { if (mounted) refresh(); };
    Promise.resolve().then(load);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("studyvault:learning-updated", refresh);
    window.addEventListener("studyvault:inbox-updated", refresh);
    return () => {
      mounted = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("studyvault:learning-updated", refresh);
      window.removeEventListener("studyvault:inbox-updated", refresh);
    };
  }, [refresh]);

  const filtered = useMemo(() => {
    const cutoff = range === "all" ? 0 : now - Number(range) * 24 * 60 * 60 * 1000;
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) =>
      (kind === "all" || entry.kind === kind)
      && entry.at >= cutoff
      && (!normalizedQuery || `${entry.title} ${entry.detail}`.toLowerCase().includes(normalizedQuery)),
    );
  }, [entries, kind, range, query, now]);

  const grouped = useMemo(() => {
    const result: { label: string; entries: ActivityEntry[] }[] = [];
    for (const entry of filtered) {
      const label = dateLabel(entry.at);
      const last = result[result.length - 1];
      if (last?.label === label) last.entries.push(entry);
      else result.push({ label, entries: [entry] });
    }
    return result;
  }, [filtered]);

  const counts = useMemo(() => ({
    sessions: entries.filter((entry) => entry.kind === "planner").length,
    reviews: entries.filter((entry) => entry.kind === "review").length,
    reflections: entries.filter((entry) => entry.kind === "reflection").length,
  }), [entries]);

  return (
    <div className="activity-page">
      <header className="activity-header">
        <div>
          <p className="activity-eyebrow"><Activity size={14} /> YOUR LEARNING RECORD</p>
          <h1>Study activity <em>timeline</em></h1>
          <p>One chronological view of your completed sessions, recall attempts, saved reflections and due reviews.</p>
        </div>
        <button className="activity-refresh" onClick={refresh}><ArrowDownRight size={15} /> Refresh activity</button>
      </header>

      <div className="activity-stat-grid">
        <article><span className="activity-stat-icon"><CalendarCheck size={17} /></span><small>Completed sessions</small><strong>{counts.sessions}</strong></article>
        <article><span className="activity-stat-icon"><BookOpen size={17} /></span><small>Recorded recall attempts</small><strong>{counts.reviews}</strong></article>
        <article><span className="activity-stat-icon"><NotebookPen size={17} /></span><small>Saved reflections</small><strong>{counts.reflections}</strong></article>
      </div>

      <section className="activity-toolbar" aria-label="Timeline filters">
        <div className="activity-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity…" aria-label="Search activity" /></div>
        <div className="activity-filter-label"><Filter size={14} /> Type</div>
        <div className="activity-filter-group" role="group" aria-label="Activity type">
          {([{value:"all",label:"All activity"},{value:"planner",label:"Sessions"},{value:"review",label:"Recall"},{value:"reflection",label:"Reflections"},{value:"due",label:"Due reviews"}] as {value:FilterKind;label:string}[]).map((item) => (
            <button key={item.value} className={kind === item.value ? "active" : ""} aria-pressed={kind === item.value} onClick={() => setKind(item.value)}>{item.label}</button>
          ))}
        </div>
        <label className="activity-range-label">Period
          <select value={range} onChange={(event) => setRange(event.target.value as RangeKind)}>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All recorded</option>
          </select>
        </label>
      </section>

      <section className="activity-timeline-panel">
        <div className="activity-panel-heading"><div><p className="activity-eyebrow"><Sparkles size={13} /> YOUR HISTORY</p><h2>Recent activity</h2></div><span>{filtered.length} {filtered.length === 1 ? "event" : "events"}</span></div>
        {grouped.length === 0 ? (
          <div className="activity-empty"><span><Activity size={24} /></span><h3>No matching activity yet</h3><p>Try another period or filter. As you study, record recall outcomes and finish planner sessions, they will appear here.</p><button onClick={() => { setKind("all"); setRange("all"); setQuery(""); }}>Show all activity</button></div>
        ) : (
          <div className="activity-groups">
            {grouped.map((group) => (
              <section className="activity-day" key={group.label}>
                <h3>{group.label}</h3>
                <div className="activity-day-list">
                  {group.entries.map((entry) => (
                    <article className={`activity-entry activity-entry-${entry.kind}`} key={entry.id}>
                      <span className="activity-entry-icon">{iconFor(entry.kind)}</span>
                      <div className="activity-entry-copy"><h4>{entry.title}</h4><p>{entry.detail}</p><small>{new Date(entry.at).toLocaleTimeString(undefined, {hour:"numeric",minute:"2-digit"})}</small></div>
                      {entry.outcome && <span className={`activity-outcome activity-outcome-${entry.outcome}`}>{entry.outcome === "correct" ? <CheckCircle2 size={12} /> : entry.outcome === "partial" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{entry.outcome}</span>}
                      <button className="activity-open" onClick={() => onNavigate(entry.href)} aria-label={`Open ${entry.href}`} title={`Open ${entry.href}`}><ArrowUpRight size={15} /></button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <p className="activity-privacy-note">Built from records saved in this browser. StudyVault does not infer missing activity or represent this timeline as a complete audit log.</p>
      </section>
    </div>
  );
}
