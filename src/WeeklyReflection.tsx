import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, Clock3, Flame,
  NotebookPen, Sparkles, Target,
} from "lucide-react";
import {
  readPlannerHistory, summarizePlannerWeek, weekBounds,
} from "./services/plannerHistory";
import { getLearningEvents } from "./services/learningCore";
import "./weekly-reflection.css";

const REFLECTION_KEY = "studyvault-weekly-reflections-v1";

type ReflectionRecord = {
  wentWell: string;
  feltDifficult: string;
  nextFocus: string;
  updatedAt: number;
};

function readReflections(): Record<string, ReflectionRecord> {
  try {
    const raw = localStorage.getItem(REFLECTION_KEY);
    const value: unknown = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, ReflectionRecord>
      : {};
  } catch {
    return {};
  }
}

function saveReflection(key: string, record: ReflectionRecord): boolean {
  try {
    const all = readReflections();
    localStorage.setItem(REFLECTION_KEY, JSON.stringify({ ...all, [key]: record }));
    return true;
  } catch {
    return false;
  }
}

function dateLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function WeeklyReflectionForm({ weekKey }: { weekKey: string }) {
  const [initial] = useState(() => readReflections()[weekKey] ?? {
    wentWell: "", feltDifficult: "", nextFocus: "", updatedAt: 0,
  });
  const [wentWell, setWentWell] = useState(initial.wentWell);
  const [feltDifficult, setFeltDifficult] = useState(initial.feltDifficult);
  const [nextFocus, setNextFocus] = useState(initial.nextFocus);
  const [saveMessage, setSaveMessage] = useState("");

  const handleSave = () => {
    const record = { wentWell, feltDifficult, nextFocus, updatedAt: Date.now() };
    if (!saveReflection(weekKey, record)) {
      setSaveMessage("Could not save this reflection on this device. Check available storage and try again.");
      return;
    }
    setSaveMessage("Reflection saved on this device.");
  };

  return (
    <section className="weekly-reflection-card">
      <div className="weekly-section-title"><span className="weekly-section-icon"><NotebookPen size={18} /></span><div><p className="weekly-eyebrow">YOUR REFLECTION</p><h2>Make next week easier</h2></div></div>
      <label>What went well?
        <textarea value={wentWell} onChange={(event) => setWentWell(event.target.value)} rows={3} maxLength={1200} placeholder="A topic I understood, a habit I kept, or a small win…" />
      </label>
      <label>What felt difficult?
        <textarea value={feltDifficult} onChange={(event) => setFeltDifficult(event.target.value)} rows={3} maxLength={1200} placeholder="A distraction, a confusing concept, or a plan that was too ambitious…" />
      </label>
      <label>One focus for next week
        <textarea value={nextFocus} onChange={(event) => setNextFocus(event.target.value)} rows={2} maxLength={600} placeholder="Choose one useful next step…" />
      </label>
      <div className="weekly-save-row">
        <button className="weekly-save-button" onClick={handleSave}>Save reflection <ArrowRight size={15} /></button>
        <span role="status" aria-live="polite">{saveMessage}</span>
      </div>
      <p className="weekly-privacy-note">Your reflection stays in this browser on this device. It is not sent to a server.</p>
    </section>
  );
}

export default function WeeklyReflection() {
  const [anchor, setAnchor] = useState(() => Date.now());
  const [currentTime] = useState(() => Date.now());
  const [history, setHistory] = useState(() => readPlannerHistory());
  const [events, setEvents] = useState(() => getLearningEvents());
  const bounds = useMemo(() => weekBounds(anchor), [anchor]);
  const summary = useMemo(
    () => summarizePlannerWeek(history, bounds.startAt, bounds.endAt),
    [history, bounds],
  );
  const weeklyEvents = useMemo(
    () => events.filter((event) => event.at >= bounds.startAt && event.at < bounds.endAt),
    [events, bounds],
  );
  const recallOutcomes = weeklyEvents.reduce((total, event) => {
    total[event.outcome] += 1;
    return total;
  }, { correct: 0, partial: 0, incorrect: 0 });
  const recallTotal = recallOutcomes.correct + recallOutcomes.partial + recallOutcomes.incorrect;
  const performance = recallTotal
    ? Math.round(((recallOutcomes.correct + recallOutcomes.partial * 0.5) / recallTotal) * 100)
    : null;
  const isCurrentWeek = bounds.startAt <= currentTime && currentTime < bounds.endAt;

  useEffect(() => {
    const refresh = () => {
      setHistory(readPlannerHistory());
      setEvents(getLearningEvents());
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("studyvault:learning-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("studyvault:learning-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const shiftWeek = (amount: number) => {
    const next = new Date(anchor);
    next.setDate(next.getDate() + amount * 7);
    setAnchor(next.getTime());
  };

  return (
    <div className="weekly-reflection-page">
      <header className="weekly-reflection-header">
        <div>
          <p className="weekly-eyebrow"><Sparkles size={14} /> LEARN FROM YOUR WEEK</p>
          <h1>Small steps. <em>Real progress.</em></h1>
          <p>Use your actual study sessions and recall activity to decide what to keep, change and try next.</p>
        </div>
        <div className="weekly-week-switcher">
          <button aria-label="Previous week" onClick={() => shiftWeek(-1)}><ArrowLeft size={16} /></button>
          <span>{dateLabel(bounds.startAt)} – {dateLabel(bounds.endAt - 1)}</span>
          <button aria-label="Next week" onClick={() => shiftWeek(1)} disabled={isCurrentWeek}><ArrowRight size={16} /></button>
        </div>
      </header>

      <section className="weekly-summary-grid" aria-label="Weekly study summary">
        <article className="weekly-summary-card">
          <span><CalendarCheck size={17} /></span><small>Sessions completed</small><strong>{summary.completedSessions}</strong><p>Finished planner sessions</p>
        </article>
        <article className="weekly-summary-card">
          <span><Clock3 size={17} /></span><small>Planned study time</small><strong>{summary.plannedMinutes} <i>min</i></strong><p>Time allocated to completed sessions</p>
        </article>
        <article className="weekly-summary-card">
          <span><Flame size={17} /></span><small>Active days</small><strong>{summary.activeDays}<i> / 7</i></strong><p>Days with a completed session</p>
        </article>
        <article className="weekly-summary-card">
          <span><Target size={17} /></span><small>Recall performance</small><strong>{performance === null ? "—" : `${performance}%`}</strong><p>{recallTotal ? `${recallTotal} recorded recall outcomes` : "No recorded outcomes this week"}</p>
        </article>
      </section>

      <div className="weekly-reflection-layout">
        <section className="weekly-evidence-card">
          <div className="weekly-section-title"><span className="weekly-section-icon"><CheckCircle2 size={18} /></span><div><p className="weekly-eyebrow">YOUR EVIDENCE</p><h2>What the data says</h2></div></div>
          {summary.completedSessions === 0 && weeklyEvents.length === 0 ? (
            <div className="weekly-empty-state"><NotebookPen size={25} /><h3>A clean slate, not a failure.</h3><p>There's no recorded activity for this week yet. Start with one short planner session, or write a reflection based on your own experience.</p></div>
          ) : (
            <>
              <div className="weekly-evidence-row"><span>Tasks completed</span><strong>{summary.completedTasks}</strong></div>
              <div className="weekly-evidence-row"><span>Correct recall</span><strong>{recallOutcomes.correct}</strong></div>
              <div className="weekly-evidence-row"><span>Partial recall</span><strong>{recallOutcomes.partial}</strong></div>
              <div className="weekly-evidence-row"><span>Needs another look</span><strong>{recallOutcomes.incorrect}</strong></div>
              <p className="weekly-evidence-note">Recall performance counts a partial outcome as half credit. Activity is based on locally saved events, not estimates.</p>
            </>
          )}
        </section>

        <WeeklyReflectionForm key={bounds.key} weekKey={bounds.key} />
      </div>
    </div>
  );
}
