import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowRight, BookOpen, Check, CirclePause, CirclePlay, Coffee, RotateCcw, ShieldCheck, Timer, Waves } from "lucide-react";
import type { Subject } from "./Subjects";

type Props = { subjects: Subject[]; onOpenReview: () => void };
type Mode = "steady" | "deep" | "sprint";
type RunState = "idle" | "running" | "paused" | "complete";
type SavedRun = { id: string; date: string; subject: string; topic: string; plannedMinutes: number; actualSeconds: number; interruptions: number; completed: boolean; endedAt: number };
type Persisted = { mode: Mode; state: RunState; endsAt: number | null; remainingMs: number; subject: string; topic: string; interruptions: number; startedAt: number | null; phase: "focus" | "break" };
const STATE_KEY = "studyvault-focus-cockpit-v1";
const HISTORY_KEY = "studyvault-focus-history-v1";
const MODES: Record<Mode, { label: string; focus: number; rest: number; note: string }> = {
  steady: { label: "Steady", focus: 25, rest: 5, note: "A classic focus cycle with a short reset." },
  deep: { label: "Deep work", focus: 50, rest: 10, note: "For problem-solving, coding and difficult concepts." },
  sprint: { label: "Sprint", focus: 15, rest: 3, note: "A small start when getting going feels hard." },
};
const freshState = (): Persisted => ({ mode: "steady", state: "idle", endsAt: null, remainingMs: 25 * 60_000, subject: "", topic: "", interruptions: 0, startedAt: null, phase: "focus" });
function readState(): Persisted {
  try { const raw = localStorage.getItem(STATE_KEY); if (raw) return { ...freshState(), ...JSON.parse(raw) as Persisted }; } catch { /* Keep safe defaults when storage is unavailable. */ }
  return freshState();
}
function readHistory(): SavedRun[] {
  try { const raw = localStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) as SavedRun[] : []; } catch { return []; }
}
function todayKey(date = new Date()) { return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0"); }
function formatTime(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}
function formatDuration(seconds: number) {
  const mins = Math.round(seconds / 60);
  return mins < 60 ? mins + " min" : Math.floor(mins / 60) + "h " + (mins % 60 ? mins % 60 + "m" : "");
}

export default function FocusCockpit({ subjects, onOpenReview }: Props) {
  const [session, setSession] = useState<Persisted>(readState);
  const [history, setHistory] = useState<SavedRun[]>(readHistory);
  const [now, setNow] = useState(Date.now());
  const [savedNotice, setSavedNotice] = useState(false);
  const mode = MODES[session.mode] ?? MODES.steady;
  const remaining = session.state === "running" && session.endsAt !== null ? Math.max(0, session.endsAt - now) : session.remainingMs;
  const totalMs = (session.phase === "focus" ? mode.focus : mode.rest) * 60_000;
  const progress = Math.min(1, Math.max(0, 1 - remaining / Math.max(1, totalMs)));
  const todayRuns = useMemo(() => history.filter(run => run.date === todayKey()), [history]);
  const todayMinutes = Math.round(todayRuns.reduce((sum, run) => sum + run.actualSeconds, 0) / 60);
  const todayCompleted = todayRuns.filter(run => run.completed).length;

  useEffect(() => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(session)); } catch { /* Timer remains usable for this visit. */ }
  }, [session]);

  useEffect(() => {
    if (session.state !== "running") return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [session.state, session.endsAt]);

  useEffect(() => {
    if (session.state !== "running" || session.endsAt === null || now < session.endsAt) return;
    const finishedFocus = session.phase === "focus";
    if (finishedFocus && session.startedAt !== null) {
      const run: SavedRun = {
        id: String(session.startedAt), date: todayKey(new Date(session.startedAt)), subject: session.subject || "Unassigned",
        topic: session.topic.trim() || "Focused study", plannedMinutes: mode.focus,
        actualSeconds: Math.max(0, Math.round((session.endsAt - session.startedAt) / 1000)),
        interruptions: session.interruptions, completed: true, endedAt: now
      };
      setHistory(previous => {
        const next = [...previous.filter(item => item.id !== run.id), run].slice(-300);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Session can finish even if history cannot persist. */ }
        return next;
      });
      setSavedNotice(true);
    }
    setSession(previous => ({ ...previous, state: "complete", endsAt: null, remainingMs: 0 }));
  }, [now, session.state, session.endsAt, session.phase, session.startedAt, session.subject, session.topic, session.interruptions, mode.focus]);

  const chooseMode = (nextMode: Mode) => {
    if (session.state === "running") return;
    setSession(previous => ({ ...previous, mode: nextMode, state: "idle", endsAt: null, remainingMs: MODES[nextMode].focus * 60_000, startedAt: null, interruptions: 0, phase: "focus" }));
    setSavedNotice(false);
  };
  const start = () => {
    const duration = session.remainingMs > 0 ? session.remainingMs : mode.focus * 60_000;
    const timestamp = Date.now();
    setNow(timestamp);
    setSession(previous => ({ ...previous, state: "running", endsAt: timestamp + duration, remainingMs: duration, startedAt: previous.startedAt ?? timestamp, phase: "focus" }));
    setSavedNotice(false);
  };
  const pause = () => {
    const left = session.endsAt === null ? session.remainingMs : Math.max(0, session.endsAt - Date.now());
    setNow(Date.now());
    setSession(previous => ({ ...previous, state: "paused", endsAt: null, remainingMs: left }));
  };
  const reset = () => {
    if (session.startedAt !== null && session.state !== "complete") {
      const elapsed = Math.max(0, Math.round((Date.now() - session.startedAt) / 1000));
      if (elapsed >= 60) {
        const run: SavedRun = { id: String(session.startedAt), date: todayKey(new Date(session.startedAt)), subject: session.subject || "Unassigned", topic: session.topic.trim() || "Focused study", plannedMinutes: mode.focus, actualSeconds: elapsed, interruptions: session.interruptions, completed: false, endedAt: Date.now() };
        setHistory(previous => { const next = [...previous.filter(item => item.id !== run.id), run].slice(-300); try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Keep the current UI usable. */ } return next; });
      }
    }
    setSession(previous => ({ ...previous, state: "idle", endsAt: null, remainingMs: MODES[previous.mode].focus * 60_000, startedAt: null, interruptions: 0, phase: "focus" }));
    setSavedNotice(false);
  };
  const changePhase = () => {
    const nextPhase = session.phase === "focus" ? "break" : "focus";
    const duration = (nextPhase === "focus" ? mode.focus : mode.rest) * 60_000;
    setSession(previous => ({ ...previous, phase: nextPhase, state: "idle", endsAt: null, remainingMs: duration, startedAt: null, interruptions: 0 }));
    setSavedNotice(false);
  };
  const canEdit = session.state !== "running";

  return (
    <div className="focus-cockpit">
      <header className="focus-page-heading">
        <div><p className="focus-eyebrow"><span /> YOUR PERSONAL LEARNING OS</p><h1>Focus <em>Cockpit.</em></h1><p className="focus-intro">One session. One clear target. Your attention, intentionally spent.</p></div>
        <div className="focus-private"><ShieldCheck size={15} /> Stored on this device</div>
      </header>

      <section className="focus-main-grid">
        <div className="focus-timer-panel">
          <div className="focus-panel-top"><div><span className="focus-overline">{session.phase === "focus" ? "FOCUS SESSION" : "RECOVERY BREAK"}</span><h2>{session.state === "complete" ? "Session complete." : session.phase === "focus" ? "Settle into the work." : "Step away for a moment."}</h2></div><span className={"focus-state-pill " + session.state}><i />{session.state === "running" ? "In progress" : session.state === "paused" ? "Paused" : session.state === "complete" ? "Complete" : "Ready when you are"}</span></div>
          <div className="focus-mode-switch" role="group" aria-label="Timer duration">
            {(Object.keys(MODES) as Mode[]).map(key => <button key={key} type="button" className={session.mode === key ? "selected" : ""} onClick={() => chooseMode(key)} disabled={!canEdit}><strong>{MODES[key].label}</strong><span>{MODES[key].focus} min</span></button>)}
          </div>
          <div className="focus-clock-area">
            <div className="focus-progress-ring" style={{ "--focus-progress": String(progress) } as React.CSSProperties} aria-label={Math.round(progress * 100) + "% complete"}>
              <div className="focus-clock-inner"><span className="focus-clock-caption">{session.phase === "focus" ? "TIME REMAINING" : "BREAK REMAINING"}</span><strong aria-live="off">{formatTime(remaining)}</strong><span className="focus-clock-sub">{session.state === "running" ? "Protect this block" : session.state === "paused" ? "Paused — resume when ready" : session.state === "complete" ? "You showed up. That counts." : mode.note}</span></div>
            </div>
          </div>
          <div className="focus-controls">
            {session.state === "running" ? <button className="focus-primary-button" type="button" onClick={pause}><CirclePause size={19} /> Pause session</button> : <button className="focus-primary-button" type="button" onClick={start}><CirclePlay size={19} /> {session.state === "paused" ? "Resume focus" : session.state === "complete" ? "Start another" : "Start focus"}</button>}
            <button className="focus-secondary-button" type="button" onClick={reset}><RotateCcw size={16} /> Reset</button>
            <button className="focus-secondary-button" type="button" onClick={changePhase}><Coffee size={16} /> {session.phase === "focus" ? "Take a break" : "Back to focus"}</button>
          </div>
          <p className="focus-timer-footnote"><Waves size={14} /> No pressure to be perfect. If focus slips, return to the next small action.</p>
        </div>

        <aside className="focus-intention-panel">
          <div className="focus-section-label"><BookOpen size={15} /> SESSION INTENTION</div>
          <label htmlFor="focus-subject">Subject</label>
          <select id="focus-subject" value={session.subject} onChange={event => setSession(previous => ({ ...previous, subject: event.target.value }))} disabled={!canEdit}>
            <option value="">Choose a subject</option>
            {subjects.map(subject => <option key={subject.id} value={subject.name}>{subject.name}</option>)}
          </select>
          <label htmlFor="focus-topic">What will you work on?</label>
          <textarea id="focus-topic" rows={3} maxLength={220} placeholder="e.g. Process states — explain each state from memory" value={session.topic} onChange={event => setSession(previous => ({ ...previous, topic: event.target.value }))} disabled={!canEdit} />
          <div className="focus-intention-tip"><Activity size={16} /><p><strong>Make it concrete.</strong><br />Choose an outcome you can demonstrate, not just a chapter to read.</p></div>
          <div className="focus-interruptions"><div><span>Interruptions</span><strong>{session.interruptions}</strong></div><button type="button" onClick={() => setSession(previous => ({ ...previous, interruptions: previous.interruptions + 1 }))} disabled={!canEdit}>+ Log interruption</button></div>
          {savedNotice && <div className="focus-saved-note" role="status"><Check size={16} /> Completed session saved to your local history.</div>}
          {session.state === "complete" && <button className="focus-review-link" type="button" onClick={onOpenReview}>Review what you learned <ArrowRight size={15} /></button>}
        </aside>
      </section>

      <section className="focus-bottom-grid">
        <div className="focus-summary-panel">
          <div className="focus-summary-heading"><div><span className="focus-overline">TODAY, SO FAR</span><h2>Progress with purpose.</h2></div><span className="focus-summary-date">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span></div>
          <div className="focus-stat-grid"><div><span>Focused time</span><strong>{formatDuration(todayMinutes * 60)}</strong><small>Recorded sessions</small></div><div><span>Sessions finished</span><strong>{todayCompleted}</strong><small>Completed focus blocks</small></div><div><span>Sessions logged</span><strong>{todayRuns.length}</strong><small>Including early stops</small></div></div>
        </div>
        <div className="focus-recent-panel"><div className="focus-summary-heading"><div><span className="focus-overline">RECENT WORK</span><h2>Small wins add up.</h2></div><Timer size={18} /></div>
          {history.length === 0 ? <div className="focus-empty"><span><BookOpen size={18} /></span><p>Your first session will appear here.</p><small>Pick a target, then start the timer.</small></div> : <div className="focus-history-list">{[...history].reverse().slice(0, 4).map(run => <div className="focus-history-item" key={run.id}><span className="focus-history-mark">{run.completed ? <Check size={15} /> : <ArrowDownRight size={15} />}</span><div><strong>{run.topic}</strong><small>{run.subject} · {formatDuration(run.actualSeconds)}</small></div><span className={run.completed ? "focus-history-status done" : "focus-history-status"}>{run.completed ? "Done" : "Stopped early"}</span></div>)}</div>}
        </div>
      </section>
      <footer className="focus-footer"><span>FOCUS IS A PRACTICE, NOT A PERSONALITY TEST.</span><button type="button" onClick={onOpenReview}>Go to revision <ArrowRight size={15} /></button></footer>
    </div>
  );
}
