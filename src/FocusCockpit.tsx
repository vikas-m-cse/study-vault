import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Activity, ArrowDownRight, ArrowRight, BookOpen, Brain, Check, CirclePause, CirclePlay, Coffee, ClipboardCheck, Minimize2, Move, RotateCcw, ShieldCheck, Smartphone, Sparkles, Timer, Waves, X } from "lucide-react";
import type { Subject } from "./Subjects";
import FocusReviewQueue from "./FocusReviewQueue";

type Props = { subjects: Subject[]; onOpenReview: () => void; isActive?: boolean };
type Mode = "steady" | "deep" | "sprint";
type RunState = "idle" | "running" | "paused" | "complete";
type SavedRun = { id: string; date: string; subject: string; topic: string; plannedMinutes: number; actualSeconds: number; interruptions: number; completed: boolean; endedAt: number };
type Persisted = { mode: Mode; state: RunState; endsAt: number | null; remainingMs: number; subject: string; topic: string; interruptions: number; activeElapsedMs: number; startedAt: number | null; phase: "focus" | "break" };
const STATE_KEY = "studyvault-focus-cockpit-v1";
const HISTORY_KEY = "studyvault-focus-history-v1";
const FLOATING_KEY = "studyvault-floating-timer-v1";
const POSITION_KEY = "studyvault-floating-timer-position-v1";
type FloatingPosition = { x: number; y: number };
function readFloatingPosition(): FloatingPosition {
  try { const saved = localStorage.getItem(POSITION_KEY); if (saved) return JSON.parse(saved) as FloatingPosition; } catch { /* Use the default position. */ }
  return { x: typeof window === "undefined" ? 24 : Math.max(12, window.innerWidth - 244), y: typeof window === "undefined" ? 120 : Math.max(12, window.innerHeight - 150) };
}
const MODES: Record<Mode, { label: string; focus: number; rest: number; note: string }> = {
  steady: { label: "Steady", focus: 25, rest: 5, note: "A classic focus cycle with a short reset." },
  deep: { label: "Deep work", focus: 50, rest: 10, note: "For problem-solving, coding and difficult concepts." },
  sprint: { label: "Sprint", focus: 15, rest: 3, note: "A small start when getting going feels hard." },
};
const freshState = (): Persisted => ({ mode: "steady", state: "idle", endsAt: null, remainingMs: 25 * 60_000, subject: "", topic: "", interruptions: 0, activeElapsedMs: 0, startedAt: null, phase: "focus" });
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

export default function FocusCockpit({ subjects, onOpenReview, isActive = true }: Props) {
  const [session, setSession] = useState<Persisted>(readState);
  const [history, setHistory] = useState<SavedRun[]>(readHistory);
  const [now, setNow] = useState(() => Date.now());
  const [savedNotice, setSavedNotice] = useState(false);
  const [phoneAway, setPhoneAway] = useState(false);
  const [recallNotes, setRecallNotes] = useState("");
  const [teachBack, setTeachBack] = useState("");
  const [selfTest, setSelfTest] = useState("");
  const [reviewWhen, setReviewWhen] = useState("tomorrow");
  const [learningSaved, setLearningSaved] = useState(false);
  const [floatingOpen, setFloatingOpen] = useState(() => { try { return localStorage.getItem(FLOATING_KEY) === "true"; } catch { return false; } });
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition>(readFloatingPosition);
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
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
    try { localStorage.setItem(FLOATING_KEY, String(floatingOpen)); } catch { /* Floating timer still works for this visit. */ }
  }, [floatingOpen]);

  useEffect(() => {
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(floatingPosition)); } catch { /* Position still works for this visit. */ }
  }, [floatingPosition]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragOrigin.current) return;
      const nextX = dragOrigin.current.x + event.clientX - dragOrigin.current.pointerX;
      const nextY = dragOrigin.current.y + event.clientY - dragOrigin.current.pointerY;
      setFloatingPosition({ x: Math.min(Math.max(8, nextX), Math.max(8, window.innerWidth - 224)), y: Math.min(Math.max(8, nextY), Math.max(8, window.innerHeight - 112)) });
    };
    const stop = () => { dragOrigin.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
  }, []);

  const beginFloatingDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    dragOrigin.current = { pointerX: event.clientX, pointerY: event.clientY, x: floatingPosition.x, y: floatingPosition.y };
  };

  useEffect(() => {
    if (session.state !== "running") return;
    const tick = () => {
      const currentNow = Date.now();
      setNow(currentNow);
      if (session.endsAt === null || currentNow < session.endsAt) return;
      if (session.phase === "focus" && session.startedAt !== null) {
        const run: SavedRun = {
          id: String(session.startedAt), date: todayKey(new Date(session.startedAt)), subject: session.subject || "Unassigned",
          topic: session.topic.trim() || "Focused study", plannedMinutes: mode.focus,
          actualSeconds: Math.max(0, Math.round((session.activeElapsedMs + session.remainingMs) / 1000)),
          interruptions: session.interruptions, completed: true, endedAt: currentNow
        };
        setHistory(previous => {
          const next = [...previous.filter(item => item.id !== run.id), run].slice(-300);
          try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Session can finish even if history cannot persist. */ }
          return next;
        });
        setSavedNotice(true);
      }
      setSession(previous => previous.state !== "running" ? previous : ({ ...previous, state: "complete", endsAt: null, remainingMs: 0 }));
    };
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [session.state, session.endsAt, session.phase, session.startedAt, session.subject, session.topic, session.interruptions, session.activeElapsedMs, session.remainingMs, mode.focus]);

  const chooseMode = (nextMode: Mode) => {
    if (session.state === "running") return;
    setSession(previous => ({ ...previous, mode: nextMode, state: "idle", endsAt: null, remainingMs: MODES[nextMode].focus * 60_000, startedAt: null, interruptions: 0, activeElapsedMs: 0, phase: "focus" }));
    setSavedNotice(false);
  };
  const start = () => {
    const duration = session.remainingMs > 0 ? session.remainingMs : mode.focus * 60_000;
    const timestamp = Date.now();
    setNow(timestamp);
    setSession(previous => ({ ...previous, state: "running", endsAt: timestamp + duration, remainingMs: duration, startedAt: previous.startedAt ?? timestamp }));
    setSavedNotice(false);
  };
  const pause = () => {
    const left = session.endsAt === null ? session.remainingMs : Math.max(0, session.endsAt - Date.now());
    setNow(Date.now());
    setSession(previous => ({ ...previous, state: "paused", endsAt: null, activeElapsedMs: previous.activeElapsedMs + Math.max(0, previous.remainingMs - left), remainingMs: left }));
  };
  const reset = () => {
    if (session.startedAt !== null && session.state !== "complete") {
      const elapsedMs = session.state === "running" && session.endsAt !== null ? session.activeElapsedMs + Math.max(0, session.remainingMs - (session.endsAt - Date.now())) : session.activeElapsedMs;
      const elapsed = Math.max(0, Math.round(elapsedMs / 1000));
      if (elapsed >= 60) {
        const run: SavedRun = { id: String(session.startedAt), date: todayKey(new Date(session.startedAt)), subject: session.subject || "Unassigned", topic: session.topic.trim() || "Focused study", plannedMinutes: mode.focus, actualSeconds: elapsed, interruptions: session.interruptions, completed: false, endedAt: Date.now() };
        setHistory(previous => { const next = [...previous.filter(item => item.id !== run.id), run].slice(-300); try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Keep the current UI usable. */ } return next; });
      }
    }
    setSession(previous => ({ ...previous, state: "idle", endsAt: null, remainingMs: MODES[previous.mode].focus * 60_000, startedAt: null, interruptions: 0, activeElapsedMs: 0, phase: "focus" }));
    setSavedNotice(false);
  };
  const changePhase = () => {
    const nextPhase = session.phase === "focus" ? "break" : "focus";
    const duration = (nextPhase === "focus" ? mode.focus : mode.rest) * 60_000;
    setSession(previous => ({ ...previous, phase: nextPhase, state: "idle", endsAt: null, remainingMs: duration, startedAt: null, interruptions: 0, activeElapsedMs: 0 }));
    setSavedNotice(false);
  };
  const canEdit = session.state !== "running";

  return (
    <div className={"focus-cockpit" + (isActive ? " focus-page-active" : " focus-page-inactive")}>
      <header className="focus-page-heading">
        <div><p className="focus-eyebrow"><span /> YOUR PERSONAL LEARNING OS</p><h1>Focus <em>Cockpit.</em></h1><p className="focus-intro">One session. One clear target. Your attention, intentionally spent.</p></div>
        <div className="focus-heading-actions"><button className="focus-popout-button" type="button" onClick={() => setFloatingOpen(true)}><Move size={15} /> {floatingOpen ? "Timer is floating" : "Float timer"}</button><div className="focus-private"><ShieldCheck size={15} /> Stored on this device</div></div>
      </header>

      <section className="focus-main-grid">
        <div className="focus-timer-panel">
          <div className="focus-panel-top"><div><span className="focus-overline">{session.phase === "focus" ? "FOCUS SESSION" : "RECOVERY BREAK"}</span><h2>{session.state === "complete" ? "Session complete." : session.phase === "focus" ? "Settle into the work." : "Step away for a moment."}</h2></div><span className={"focus-state-pill " + session.state}><i />{session.state === "running" ? "In progress" : session.state === "paused" ? "Paused" : session.state === "complete" ? "Complete" : "Ready when you are"}</span></div>
          <div className="focus-mode-switch" role="group" aria-label="Timer duration">
            {(Object.keys(MODES) as Mode[]).map(key => <button key={key} type="button" className={session.mode === key ? "selected" : ""} onClick={() => chooseMode(key)} disabled={!canEdit}><strong>{MODES[key].label}</strong><span>{MODES[key].focus} min</span></button>)}
          </div>
          <div className="focus-clock-area">
            <div className="focus-progress-ring" style={{ "--focus-progress": String(progress) } as CSSProperties} aria-label={Math.round(progress * 100) + "% complete"}>
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

      <section className="guided-learning-panel" aria-labelledby="guided-learning-title">
        <div className="guided-learning-heading">
          <div><span className="focus-overline"><Sparkles size={13} /> THE LEARNING LOOP</span><h2 id="guided-learning-title">Turn focus into lasting learning.</h2><p>Use the last few minutes to retrieve, explain and test what you studied.</p></div>
          <span className="guided-learning-badge"><Brain size={14} /> Active learning</span>
        </div>
        <div className="guided-learning-prep">
          <label className={"guided-phone-check" + (phoneAway ? " checked" : "")}><input type="checkbox" checked={phoneAway} onChange={event => setPhoneAway(event.target.checked)} /><span className="guided-check-icon">{phoneAway ? <Check size={15} /> : <Smartphone size={15} />}</span><span><strong>Distraction shield</strong><small>{phoneAway ? "Phone away — protect this block." : "Put your phone out of reach before starting."}</small></span></label>
          <div className="guided-block-note"><Timer size={15} /><span><strong>One target at a time</strong><small>Steady 25 min · Deep work 50 min · Sprint 15 min</small></span></div>
        </div>
        <div className="guided-learning-grid">
          <label className="guided-learning-step"><span className="guided-step-number">01</span><span className="guided-step-title"><Brain size={16} /> Recall from memory</span><small>Close your material first. Write what you remember.</small><textarea rows={4} value={recallNotes} onChange={event => setRecallNotes(event.target.value)} placeholder="What were the key ideas? Can you draw the diagram or list the steps?" /></label>
          <label className="guided-learning-step"><span className="guided-step-number">02</span><span className="guided-step-title"><BookOpen size={16} /> Teach it simply</span><small>Explain it like you're teaching a friend.</small><textarea rows={4} value={teachBack} onChange={event => setTeachBack(event.target.value)} placeholder="The main idea is… It works because… For example…" /></label>
          <label className="guided-learning-step"><span className="guided-step-number">03</span><span className="guided-step-title"><ClipboardCheck size={16} /> Test yourself</span><small>Answer without notes, then check for gaps.</small><textarea rows={4} value={selfTest} onChange={event => setSelfTest(event.target.value)} placeholder="Question I tested myself on… My answer… What I need to correct…" /></label>
        </div>
        <div className="guided-learning-footer">
          <label className="guided-review-select"><span>Next review</span><select value={reviewWhen} onChange={event => setReviewWhen(event.target.value)}><option value="tonight">Later today</option><option value="tomorrow">Tomorrow</option><option value="3days">In 3 days</option><option value="7days">In 7 days</option></select></label>
          <p><ShieldCheck size={14} /> Your learning notes are saved on this device automatically.</p>
          <button type="button" className="guided-save-button" onClick={() => { setLearningSaved(true); window.setTimeout(() => setLearningSaved(false), 2200); }}><Check size={15} /> {learningSaved ? "Learning log saved" : "Finish learning loop"}</button>
        </div>
      </section>

      <FocusReviewQueue subject={session.subject} topic={session.topic} recallNotes={recallNotes} selfTest={selfTest} reviewWhen={reviewWhen} />

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
      {floatingOpen && createPortal(<div className={"focus-floating-timer" + (session.state === "running" ? " is-running" : "")} style={{ left: floatingPosition.x, top: floatingPosition.y }} role="region" aria-label="Movable focus timer">
        <div className="focus-floating-header" onPointerDown={beginFloatingDrag} title="Drag to move the timer anywhere on screen">
          <span className="focus-floating-grip"><Move size={13} /> DRAG TO MOVE</span>
          <div className="focus-floating-window-actions"><button type="button" aria-label="Hide floating timer" title="Hide timer" onClick={() => setFloatingOpen(false)}><Minimize2 size={14} /></button><button type="button" aria-label="Close floating timer" title="Close timer" onClick={() => setFloatingOpen(false)}><X size={14} /></button></div>
        </div>
        <div className="focus-floating-body"><div className="focus-floating-time"><span>{session.phase === "focus" ? "FOCUS" : "BREAK"} · {mode.label.toUpperCase()}</span><strong>{formatTime(remaining)}</strong><small>{session.state === "running" ? "Session in progress" : session.state === "paused" ? "Paused" : session.state === "complete" ? "Session complete" : "Ready when you are"}</small></div>
          <div className="focus-floating-controls">{session.state === "running" ? <button type="button" aria-label="Pause timer" title="Pause" onClick={pause}><CirclePause size={18} /></button> : <button type="button" aria-label="Start or resume timer" title="Start or resume" onClick={start}><CirclePlay size={18} /></button>}<button type="button" aria-label="Reset timer" title="Reset" onClick={reset}><RotateCcw size={16} /></button></div>
        </div>
      </div>, document.body)}
    </div>
  );
}
