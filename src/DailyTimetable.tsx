import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Clock3, Plus, Trash2, Check, Pencil, X,
  Coffee, BookOpen, GraduationCap, Utensils, Dumbbell, Moon, Sparkles,
} from "lucide-react";

type BlockCategory = "class" | "study" | "break" | "meal" | "personal";
type TimeBlock = {
  id: string;
  title: string;
  start: string;
  end: string;
  category: BlockCategory;
  days: "everyday" | "weekdays" | "weekend";
};
type CompletionMap = Record<string, string[]>;

const PLAN_KEY = "studyvault-daily-timetable-v1";
const COMPLETION_KEY = "studyvault-timetable-completions-v1";
const starterPlan: TimeBlock[] = [
  { id: "starter-morning", title: "Morning routine & breakfast", start: "06:30", end: "07:30", category: "personal", days: "weekdays" },
  { id: "starter-college", title: "College / classes", start: "08:00", end: "16:00", category: "class", days: "weekdays" },
  { id: "starter-reset", title: "Travel, snack & reset", start: "16:00", end: "16:45", category: "break", days: "weekdays" },
  { id: "starter-dsa", title: "Focused study", start: "16:45", end: "18:00", category: "study", days: "weekdays" },
  { id: "starter-dinner", title: "Dinner", start: "19:30", end: "20:00", category: "meal", days: "everyday" },
  { id: "starter-revision", title: "Revision & active recall", start: "20:00", end: "21:00", category: "study", days: "everyday" },
  { id: "starter-winddown", title: "Wind down & prepare for tomorrow", start: "21:00", end: "21:30", category: "personal", days: "everyday" },
];

const categoryLabels: Record<BlockCategory, string> = {
  class: "College",
  study: "Study",
  break: "Break",
  meal: "Meal",
  personal: "Personal",
};

const categoryIcons = {
  class: GraduationCap,
  study: BookOpen,
  break: Coffee,
  meal: Utensils,
  personal: Dumbbell,
};

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};
const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const formatTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

function readStoredPlan(): TimeBlock[] {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as TimeBlock[];
    }
  } catch { /* Keep the app usable if local storage is unavailable. */ }
  return starterPlan;
}

function readCompletions(): CompletionMap {
  try {
    const raw = localStorage.getItem(COMPLETION_KEY);
    if (raw) return JSON.parse(raw) as CompletionMap;
  } catch { /* Start with an empty completion history. */ }
  return {};
}

export default function DailyTimetable() {
  const [blocks, setBlocks] = useState<TimeBlock[]>(readStoredPlan);
  const [completions, setCompletions] = useState<CompletionMap>(readCompletions);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState<Omit<TimeBlock, "id">>({
    title: "", start: "17:00", end: "18:00", category: "study", days: "everyday",
  });

  useEffect(() => {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(blocks)); } catch { /* Best effort persistence. */ }
  }, [blocks]);
  useEffect(() => {
    try { localStorage.setItem(COMPLETION_KEY, JSON.stringify(completions)); } catch { /* Best effort persistence. */ }
  }, [completions]);

  const activeDate = useMemo(() => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDate]);
  const weekday = activeDate.getDay();
  const visibleBlocks = useMemo(() => blocks
    .filter((block) => block.days === "everyday" || (block.days === "weekdays" && weekday >= 1 && weekday <= 5) || (block.days === "weekend" && (weekday === 0 || weekday === 6)))
    .slice()
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)), [blocks, weekday]);
  const doneIds = completions[selectedDate] ?? [];
  const completedCount = visibleBlocks.filter((block) => doneIds.includes(block.id)).length;
  const plannedMinutes = visibleBlocks.reduce((total, block) => total + Math.max(0, timeToMinutes(block.end) - timeToMinutes(block.start)), 0);
  const completionPercent = visibleBlocks.length ? Math.round(completedCount / visibleBlocks.length * 100) : 0;
  const todayKey = dateKey(new Date());
  const isToday = selectedDate === todayKey;
  const dateLabel = isToday ? "TODAY'S PLAN" : activeDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
  const nextBlock = isToday ? visibleBlocks.find((block) => !doneIds.includes(block.id) && timeToMinutes(block.end) > new Date().getHours() * 60 + new Date().getMinutes()) : undefined;

  const openNew = () => {
    setEditingId(null);
    setDraft({ title: "", start: "17:00", end: "18:00", category: "study", days: "everyday" });
    setFormError("");
    setShowForm(true);
  };
  const openEdit = (block: TimeBlock) => {
    setEditingId(block.id);
    setDraft({ title: block.title, start: block.start, end: block.end, category: block.category, days: block.days });
    setFormError("");
    setShowForm(true);
  };
  const saveDraft = () => {
    if (!draft.title.trim()) { setFormError("Give this time block a name."); return; }
    if (timeToMinutes(draft.end) <= timeToMinutes(draft.start)) { setFormError("End time must be later than start time."); return; }
    const overlaps = visibleBlocks.some((block) => block.id !== editingId && draft.days !== "weekend" && block.days !== "weekend" && timeToMinutes(draft.start) < timeToMinutes(block.end) && timeToMinutes(draft.end) > timeToMinutes(block.start));
    if (overlaps) { setFormError("This overlaps another block on the selected day. Adjust the time or schedule."); return; }
    if (editingId) {
      setBlocks((current) => current.map((block) => block.id === editingId ? { ...draft, id: editingId, title: draft.title.trim() } : block));
    } else {
      const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setBlocks((current) => [...current, { ...draft, id, title: draft.title.trim() }]);
    }
    setShowForm(false);
  };
  const toggleDone = (id: string) => setCompletions((current) => {
    const existing = current[selectedDate] ?? [];
    return { ...current, [selectedDate]: existing.includes(id) ? existing.filter((item) => item !== id) : [...existing, id] };
  });
  const removeBlock = (id: string) => {
    setBlocks((current) => current.filter((block) => block.id !== id));
    setCompletions((current) => Object.fromEntries(Object.entries(current).map(([day, ids]) => [day, ids.filter((item) => item !== id)])));
  };
  const resetPlan = () => {
    setBlocks(starterPlan);
    setCompletions({});
  };

  return (
    <div className="timetable-page">
      <header className="timetable-header">
        <div>
          <span className="timetable-eyebrow">YOUR TIME, INTENTIONALLY SPENT</span>
          <h1>Daily <em>timetable.</em></h1>
          <p>Give every part of your day a place. Plan it, follow it, and learn from what you complete.</p>
        </div>
        <button className="timetable-primary" onClick={openNew}><Plus size={17} /> Add time block</button>
      </header>

      <section className="timetable-hero">
        <div className="timetable-hero-copy">
          <span className="timetable-eyebrow">{dateLabel}</span>
          <h2>{activeDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h2>
          <p>{visibleBlocks.length ? `${completedCount} of ${visibleBlocks.length} blocks completed. Small, consistent steps count.` : "Your day is open. Add a block to give it structure."}</p>
          <div className="timetable-progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
          <div className="timetable-progress-meta"><span>{completionPercent}% complete</span><span>{Math.floor(plannedMinutes / 60)}h {plannedMinutes % 60}m planned</span></div>
        </div>
        <div className="timetable-date-control">
          <label htmlFor="timetable-date">View another day</label>
          <input id="timetable-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          <button type="button" onClick={() => setSelectedDate(todayKey)} disabled={isToday}>Back to today</button>
        </div>
      </section>

      {isToday && nextBlock && (
        <section className="timetable-next">
          <div className="timetable-next-icon"><Sparkles size={18} /></div>
          <div><span className="timetable-eyebrow">UP NEXT</span><strong>{nextBlock.title}</strong><p>{formatTime(nextBlock.start)} – {formatTime(nextBlock.end)} · {categoryLabels[nextBlock.category]}</p></div>
        </section>
      )}

      <div className="timetable-section-heading">
        <div><span className="timetable-eyebrow">THE PLAN</span><h2>Your day, block by block</h2></div>
        <span>{visibleBlocks.length} time blocks</span>
      </div>

      {visibleBlocks.length ? (
        <div className="timetable-list">
          {visibleBlocks.map((block, index) => {
            const Icon = categoryIcons[block.category];
            const done = doneIds.includes(block.id);
            const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
            const current = isToday && nowMinutes >= timeToMinutes(block.start) && nowMinutes < timeToMinutes(block.end) && !done;
            return (
              <article className={`timetable-block ${done ? "is-done" : ""} ${current ? "is-current" : ""}`} key={block.id}>
                <div className="timetable-time"><strong>{formatTime(block.start)}</strong><span>{formatTime(block.end)}</span></div>
                <div className="timetable-timeline"><span className="timetable-timeline-dot" /><span className="timetable-timeline-line" /></div>
                <div className="timetable-block-card">
                  <div className={`timetable-block-icon category-${block.category}`}><Icon size={18} /></div>
                  <div className="timetable-block-copy"><div className="timetable-block-title-row"><h3>{block.title}</h3>{current && <span className="timetable-live-pill">NOW</span>}</div><p>{categoryLabels[block.category]} · {Math.floor((timeToMinutes(block.end) - timeToMinutes(block.start)) / 60) ? `${Math.floor((timeToMinutes(block.end) - timeToMinutes(block.start)) / 60)}h ` : ""}{(timeToMinutes(block.end) - timeToMinutes(block.start)) % 60 ? `${(timeToMinutes(block.end) - timeToMinutes(block.start)) % 60}m` : ""}</p></div>
                  <div className="timetable-block-actions">
                    <button className={`timetable-done-button ${done ? "checked" : ""}`} onClick={() => toggleDone(block.id)} aria-label={done ? `Mark ${block.title} incomplete` : `Mark ${block.title} complete`} title={done ? "Mark incomplete" : "Mark complete"}>{done ? <Check size={16} /> : <span />}</button>
                    <button className="timetable-icon-button" onClick={() => openEdit(block)} aria-label={`Edit ${block.title}`} title="Edit"><Pencil size={15} /></button>
                    <button className="timetable-icon-button delete" onClick={() => removeBlock(block.id)} aria-label={`Delete ${block.title}`} title="Delete"><Trash2 size={15} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="timetable-empty"><CalendarDays size={27} /><h3>A blank day is a fresh start.</h3><p>Add your first block or restore the editable student starter plan.</p><div><button className="timetable-primary" onClick={openNew}><Plus size={16} /> Add a block</button><button className="timetable-secondary" onClick={resetPlan}>Use starter plan</button></div></div>
      )}

      <p className="timetable-footnote"><Clock3 size={14} /> Your timetable and completion ticks are saved on this device. A completed block records your check-in, not proof of learning.</p>

      {showForm && (
        <div className="timetable-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
          <section className="timetable-modal" role="dialog" aria-modal="true" aria-labelledby="timetable-form-title">
            <div className="timetable-modal-heading"><div><span className="timetable-eyebrow">{editingId ? "REFINE YOUR ROUTINE" : "MAKE SPACE FOR WHAT MATTERS"}</span><h2 id="timetable-form-title">{editingId ? "Edit time block" : "Add time block"}</h2></div><button className="timetable-icon-button" onClick={() => setShowForm(false)} aria-label="Close form"><X size={18} /></button></div>
            <label className="timetable-field">Activity name<input autoFocus value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Java practice" maxLength={90} /></label>
            <div className="timetable-form-grid"><label className="timetable-field">Start time<input type="time" value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} /></label><label className="timetable-field">End time<input type="time" value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} /></label></div>
            <div className="timetable-form-grid"><label className="timetable-field">Type<select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as BlockCategory }))}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="timetable-field">Repeats<select value={draft.days} onChange={(event) => setDraft((current) => ({ ...current, days: event.target.value as TimeBlock["days"] }))}><option value="everyday">Every day</option><option value="weekdays">Weekdays</option><option value="weekend">Weekends</option></select></label></div>
            {formError && <p className="timetable-form-error" role="alert">{formError}</p>}
            <div className="timetable-modal-actions"><button className="timetable-secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="timetable-primary" onClick={saveDraft}>{editingId ? "Save changes" : "Add to timetable"}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
