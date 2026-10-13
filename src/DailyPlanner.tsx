import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, Check, CheckCircle2, Clock3, Eye, EyeOff,
  Pause, Play, RotateCcw, Sparkles, Target, TimerReset,
} from "lucide-react";
import { getAllNotes } from "./services/noteStorage";
import type { Note } from "./types/note";
import {
  chooseNextInterval, getMastery, learningPriority, recordLearningEvent, recordMasteryLevel,
} from "./services/learningCore";
import {
  buildRevisionPlan, conceptIdsForNote, normalizeAvailableMinutes,
  type PlannerEnergy, type PlannerGoal, type PlannedRevisionTask,
  type RevisionCandidate, type RevisionPlan,
} from "./services/dailyPlanner";
import "./daily-planner.css";
import { recordCompletedPlannerSession } from "./services/plannerHistory";

const SESSION_KEY = "studyvault-adaptive-revision-session-v1";
const REVIEW_KEY = "studyvault-review-v2";

type SessionStatus = "planned" | "active" | "paused" | "completed" | "cancelled";
type TaskStatus = "pending" | "active" | "completed" | "skipped";
type SessionTask = PlannedRevisionTask & {
  status: TaskStatus;
  outcome?: "correct" | "partial" | "incorrect";
};
type SavedSession = {
  id: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  resumedAt?: number;
  elapsedBeforePauseMs: number;
  completedAt?: number;
  plannedMinutes: number;
  energy: PlannerEnergy;
  goal: PlannerGoal;
  planVersion: number;
  tasks: SessionTask[];
  fallbackUsed: boolean;
};

function safeReadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as SavedSession;
    if (!value || !Array.isArray(value.tasks) || typeof value.id !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

function safeReadReviewState(): Record<string, { nextReviewAt?: number; lastReviewedAt?: number }> {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    return raw ? JSON.parse(raw) as Record<string, { nextReviewAt?: number; lastReviewedAt?: number }> : {};
  } catch {
    return {};
  }
}

function plainExcerpt(note: Note): string {
  return (note.plainText || "").replace(/\s+/g, " ").trim().slice(0, 1400);
}

function makeCandidates(notes: Note[], subjects: { id: number; name: string }[], now: number): RevisionCandidate[] {
  const mastery = getMastery();
  const review = safeReadReviewState();
  return notes
    .filter((note) => note.status === "active" && plainExcerpt(note).length > 0)
    .flatMap((note) => conceptIdsForNote(note.id, mastery, review).map((conceptId) => {
      const record = mastery[conceptId];
      const schedule = review[conceptId];
      const nextReviewAt = schedule?.nextReviewAt ?? record?.nextReviewAt;
      return {
        id: conceptId,
        noteId: note.id,
        noteTitle: note.title || "Untitled note",
        subjectName: subjects.find((subject) => subject.id === note.subjectId)?.name,
        excerpt: plainExcerpt(note),
        updatedAt: note.updatedAt,
        due: typeof nextReviewAt === "number" && nextReviewAt <= now,
        priority: learningPriority(record, now),
        attempts: record?.attempts ?? 0,
      };
    }));
}

function saveSession(session: SavedSession): SavedSession {
  const updated = { ...session, updatedAt: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  return updated;
}

function createSession(plan: RevisionPlan, minutes: number, energy: PlannerEnergy, goal: PlannerGoal): SavedSession {
  const now = Date.now();
  return {
    id: `revision-${now}-${Math.random().toString(36).slice(2, 8)}`,
    status: "planned",
    createdAt: now,
    updatedAt: now,
    plannedMinutes: minutes,
    energy,
    goal,
    planVersion: 1,
    elapsedBeforePauseMs: 0,
    fallbackUsed: plan.fallbackUsed,
    tasks: plan.tasks.map((task, index) => ({
      ...task,
      status: index === 0 ? "active" : "pending",
    })),
  };
}

export default function DailyPlanner({ subjects }: { subjects: { id: number; name: string }[] }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availableMinutes, setAvailableMinutes] = useState(30);
  const [energy, setEnergy] = useState<PlannerEnergy>("normal");
  const [goal, setGoal] = useState<PlannerGoal>("revision");
  const [session, setSession] = useState<SavedSession | null>(() => safeReadSession());
  const [showSource, setShowSource] = useState(false);
  const [recallText, setRecallText] = useState("");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAllNotes().then((loaded) => {
      if (!cancelled) setNotes(loaded);
    }).catch(() => {
      if (!cancelled) setLoadError("Saved notes could not be loaded. Check storage and try again.");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const candidates = useMemo(
    () => makeCandidates(notes, subjects, now),
    [notes, subjects, now],
  );
  const plan = useMemo(() => buildRevisionPlan({
    availableMinutes: normalizeAvailableMinutes(availableMinutes),
    energy,
    goal,
    now,
  }, candidates), [availableMinutes, energy, goal, now, candidates]);

  const persist = useCallback((next: SavedSession) => {
    try {
      const saved = saveSession(next);
      setSession(saved);
      setStorageError(null);
      return saved;
    } catch {
      setStorageError("This session could not be saved locally. Your action was not confirmed as saved.");
      return null;
    }
  }, []);

  const beginPlan = useCallback(() => {
    const next = createSession(plan, normalizeAvailableMinutes(availableMinutes), energy, goal);
    const saved = persist(next);
    if (saved) persist({ ...saved, status: "active", startedAt: Date.now() });
  }, [plan, availableMinutes, energy, goal, persist]);

  const updateTask = useCallback((taskId: string, patch: Partial<SessionTask>) => {
    if (!session || session.status !== "active") return;
    const tasks = session.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task);
    const nextTask = tasks.find((task) => task.status === "pending");
    const normalized = tasks.map((task) => task.status === "active" && task.id !== taskId && patch.status === "completed"
      ? { ...task, status: "completed" as TaskStatus }
      : task);
    if (patch.status === "completed" && nextTask) {
      const index = normalized.findIndex((task) => task.id === nextTask.id);
      if (index >= 0) normalized[index] = { ...normalized[index], status: "active" };
    }
    const allDone = normalized.every((task) => task.status === "completed" || task.status === "skipped");
    const saved = persist({
      ...session,
      tasks: normalized,
      status: allDone ? "completed" : session.status,
      completedAt: allDone ? Date.now() : session.completedAt,
    });
    if (saved && allDone && saved.completedAt) {
      try {
        recordCompletedPlannerSession({
          id: saved.id,
          status: "completed",
          createdAt: saved.createdAt,
          completedAt: saved.completedAt,
          plannedMinutes: saved.plannedMinutes,
          energy: saved.energy,
          goal: saved.goal,
          tasks: saved.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            minutes: task.minutes,
            status: task.status,
            outcome: task.outcome,
          })),
        });
      } catch {
        setStorageError("The session is complete, but its weekly history could not be saved.");
      }
    }
    if (saved && patch.status === "completed" && patch.outcome && taskId === "warmup" && session.tasks[0]?.candidateId) {
      const conceptId = session.tasks[0].candidateId;
      const eventKey = `studyvault-planner-event-${session.id}-${taskId}`;
      try {
        if (localStorage.getItem(eventKey) === "1") return;
        const outcome = patch.outcome;
        const timestamp = Date.now();
        const confidence = outcome === "correct" ? 80 : outcome === "partial" ? 55 : 30;
        const currentMastery = getMastery()[conceptId];
        const nextReviewAt = timestamp + chooseNextInterval(outcome, confidence, currentMastery?.bestLevel ?? 0);
        recordLearningEvent({
          conceptId,
          questionType: "recall",
          outcome,
          confidence,
          at: timestamp,
        });
        recordMasteryLevel(conceptId, outcome === "correct" ? Math.min(5, (currentMastery?.bestLevel ?? 0) + 1) : 0, nextReviewAt, timestamp);
        const reviewState = safeReadReviewState();
        reviewState[conceptId] = { ...reviewState[conceptId], nextReviewAt, lastReviewedAt: timestamp };
        localStorage.setItem(REVIEW_KEY, JSON.stringify(reviewState));
        localStorage.setItem(eventKey, "1");
      } catch {
        setStorageError("The task was saved, but the learning outcome could not be recorded.");
      }
    }
  }, [session, persist]);

  const pause = useCallback(() => {
    if (session?.status !== "active") return;
    const stamp = Date.now();
    const segmentStart = session.resumedAt ?? session.startedAt ?? stamp;
    persist({ ...session, status: "paused", elapsedBeforePauseMs: (session.elapsedBeforePauseMs ?? 0) + Math.max(0, stamp - segmentStart), resumedAt: undefined });
  }, [session, persist]);

  const resume = useCallback(() => {
    if (session?.status !== "paused" && session?.status !== "planned") return;
    const stamp = Date.now();
    persist({ ...session, status: "active", startedAt: session.startedAt ?? stamp, resumedAt: stamp });
  }, [session, persist]);

  const saveForLater = useCallback(() => {
    if (!session || (session.status !== "active" && session.status !== "paused")) return;
    const stamp = Date.now();
    const elapsedBeforePauseMs = session.status === "active"
      ? (session.elapsedBeforePauseMs ?? 0) + Math.max(0, stamp - (session.resumedAt ?? session.startedAt ?? stamp))
      : (session.elapsedBeforePauseMs ?? 0);
    persist({ ...session, status: "planned", elapsedBeforePauseMs, resumedAt: undefined });
  }, [session, persist]);

  const restart = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
      setRecallText("");
      setShowSource(false);
      setStorageError(null);
    } catch {
      setStorageError("The previous session could not be cleared.");
    }
  }, []);

  const activeTask = session?.tasks.find((task) => task.status === "active");
  const completedCount = session?.tasks.filter((task) => task.status === "completed").length ?? 0;
  const elapsedMinutes = session
    ? Math.max(0, Math.floor(((session.elapsedBeforePauseMs ?? 0) + (session.status === "active" ? now - (session.resumedAt ?? session.startedAt ?? now) : 0)) / 60000))
    : 0;

  return (
    <div className="daily-planner-page">
      <header className="planner-header">
        <div>
          <p className="planner-eyebrow"><Sparkles size={14} /> YOUR DAILY RESET</p>
          <h1>Make starting easy.</h1>
          <p className="planner-subtitle">A flexible revision plan for the time and energy you have today.</p>
        </div>
        <div className="planner-header-badge"><Clock3 size={16} /> Adaptive study session</div>
      </header>

      {(loadError || storageError) && <div className="planner-alert" role="alert">{loadError || storageError}</div>}

      {!session || session.status === "cancelled" ? (
        <section className="planner-setup planner-surface">
          <div className="planner-section-heading">
            <div><span className="planner-step">01 / SET YOUR SESSION</span><h2>How much time do you have?</h2></div>
            <span className="planner-setup-icon"><TimerReset size={22} /></span>
          </div>
          <div className="planner-time-choice">
            {[5, 10, 15, 30, 45, 60].map((minutes) => (
              <button key={minutes} className={availableMinutes === minutes ? "selected" : ""} onClick={() => setAvailableMinutes(minutes)} aria-pressed={availableMinutes === minutes}>
                <strong>{minutes}</strong><span>min</span>
              </button>
            ))}
          </div>
          <div className="planner-fields">
            <label>Energy today
              <select value={energy} onChange={(event) => setEnergy(event.target.value as PlannerEnergy)}>
                <option value="low">Low — keep it gentle</option>
                <option value="normal">Normal — steady focus</option>
                <option value="high">High — challenge me</option>
              </select>
            </label>
            <label>Study goal
              <select value={goal} onChange={(event) => setGoal(event.target.value as PlannerGoal)}>
                <option value="revision">Revise what I know</option>
                <option value="new_learning">Learn something new</option>
                <option value="exam_prep">Prepare for an exam</option>
              </select>
            </label>
          </div>

          <div className="planner-plan-preview">
            <div className="planner-preview-top"><div><span className="planner-step">02 / YOUR PLAN</span><h3>{availableMinutes}-minute {goal === "revision" ? "revision" : goal === "exam_prep" ? "exam prep" : "learning"} session</h3></div><span className="planner-total">{plan.totalMinutes} min total</span></div>
            {isLoading ? <p className="planner-muted">Finding your saved notes…</p> : (
              <>
                <div className="planner-task-list">
                  {plan.tasks.map((task, index) => (
                    <div className="planner-task-preview" key={task.id}>
                      <span className="planner-task-number">{String(index + 1).padStart(2, "0")}</span>
                      <div className="planner-task-copy"><strong>{task.title}</strong><p>{task.description}</p>{task.sourceTitle && <small><BookOpen size={12} /> {task.sourceTitle}</small>}</div>
                      <span className="planner-task-minutes">{task.minutes}m</span>
                    </div>
                  ))}
                </div>
                {plan.fallbackUsed && <p className="planner-muted planner-fallback">No eligible saved note was found. You can still start with a manual recall task.</p>}
              </>
            )}
            <button className="planner-primary" disabled={isLoading} onClick={beginPlan}><Play size={16} fill="currentColor" /> Start my session <ArrowRight size={16} /></button>
          </div>
        </section>
      ) : session.status === "completed" ? (
        <section className="planner-complete planner-surface">
          <span className="planner-complete-icon"><CheckCircle2 size={30} /></span>
          <p className="planner-step">SESSION COMPLETE</p>
          <h2>You showed up. That counts.</h2>
          <p>You completed {completedCount} of {session.tasks.length} tasks in a {session.plannedMinutes}-minute plan.</p>
          <div className="planner-summary-stats"><div><strong>{completedCount}</strong><span>Tasks completed</span></div><div><strong>{session.plannedMinutes}m</strong><span>Planned time</span></div><div><strong>{session.tasks.filter((task) => task.outcome === "correct").length}</strong><span>Recall wins</span></div></div>
          <button className="planner-primary" onClick={restart}><RotateCcw size={16} /> Build another session</button>
        </section>
      ) : (
        <section className="planner-runner planner-surface">
          <div className="planner-runner-top">
            <div><span className="planner-step">{session.status === "paused" ? "SESSION PAUSED" : session.status === "planned" ? "READY TO RESUME" : "SESSION IN PROGRESS"}</span><h2>{activeTask?.title ?? "Your session"}</h2><p>{session.plannedMinutes} minutes planned · {completedCount} of {session.tasks.length} tasks completed</p></div>
            <div className="planner-runner-time"><Clock3 size={17} /><strong>{Math.min(session.plannedMinutes, elapsedMinutes)}m</strong><span>elapsed</span></div>
          </div>
          <div className="planner-progress-track"><span style={{ width: `${session.tasks.length ? completedCount / session.tasks.length * 100 : 0}%` }} /></div>
          <div className="planner-runner-layout">
            <div className="planner-current-task">
              <div className="planner-task-kicker"><Target size={14} /> CURRENT TASK · {activeTask?.minutes ?? 0} MIN</div>
              <h3>{activeTask?.title ?? "Choose your next step"}</h3>
              <p>{activeTask?.description}</p>
              {activeTask?.sourceTitle && <div className="planner-source-card"><BookOpen size={17} /><div><strong>{activeTask.sourceTitle}</strong><span>{activeTask.rationale}</span></div></div>}
              {activeTask?.kind === "warmup" && activeTask.candidateId && (
                <label className="planner-recall-label">What do you remember? (optional)
                  <textarea value={recallText} onChange={(event) => setRecallText(event.target.value)} placeholder="Write a few key ideas from memory…" rows={3} disabled={session.status !== "active"} />
                </label>
              )}
              {activeTask?.sourceExcerpt && (
                <div className="planner-source-reveal">
                  <button className="planner-secondary" onClick={() => setShowSource((value) => !value)}>{showSource ? <EyeOff size={15} /> : <Eye size={15} />}{showSource ? "Hide source" : "Reveal source note"}</button>
                  {showSource && <blockquote>{activeTask.sourceExcerpt}</blockquote>}
                </div>
              )}
              {activeTask?.kind === "warmup" && activeTask.candidateId ? (
                <div className="planner-outcomes">
                  <p>How well did you recall it?</p>
                  <div>
                    <button disabled={session.status !== "active"} onClick={() => { updateTask(activeTask.id, { status: "completed", outcome: "incorrect" }); setShowSource(false); setRecallText(""); }}>Need review</button>
                    <button disabled={session.status !== "active"} onClick={() => { updateTask(activeTask.id, { status: "completed", outcome: "partial" }); setShowSource(false); setRecallText(""); }}>Partly</button>
                    <button disabled={session.status !== "active"} onClick={() => { updateTask(activeTask.id, { status: "completed", outcome: "correct" }); setShowSource(false); setRecallText(""); }}>Remembered</button>
                  </div>
                </div>
              ) : (
                <button className="planner-primary" onClick={() => updateTask(activeTask?.id ?? "", { status: "completed" })} disabled={!activeTask || session.status !== "active"}><Check size={16} /> Mark task complete</button>
              )}
            </div>
            <aside className="planner-session-aside">
              <span className="planner-step">SESSION FLOW</span>
              {session.tasks.map((task, index) => (
                <div className={`planner-flow-item ${task.status}`} key={task.id}>
                  <span>{task.status === "completed" ? <Check size={14} /> : String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{task.title}</strong><small>{task.minutes} minutes</small></div>
                </div>
              ))}
              <div className="planner-session-actions">
                {session.status === "active" ? <button className="planner-secondary" onClick={pause}><Pause size={14} /> Pause</button> : <button className="planner-primary" onClick={resume}><Play size={14} /> {session.status === "planned" ? "Continue session" : "Resume"}</button>}
                <button className="planner-text-button" onClick={saveForLater}>Save for later</button>
                <button className="planner-text-button" onClick={() => persist({ ...session, status: "cancelled" })}>Cancel session</button>
              </div>
            </aside>
          </div>
        </section>
      )}

      <footer className="planner-footer"><Sparkles size={14} /><span>Flexible by design. Missed a day? Just start again with one useful task.</span></footer>
      {isLoading && <span className="planner-sr-only">Loading notes</span>}
    </div>
  );
}
