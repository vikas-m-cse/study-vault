import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, Clock3, RefreshCw, Target } from "lucide-react";
import { getAllNotes } from "./services/noteStorage";
import { getLearningEvents, getMastery } from "./services/learningCore";
import { buildLearningGaps, type LearningGap } from "./services/learningGaps";
import "./learning-gaps.css";

function formatDate(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not recorded";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusLabel(gap: LearningGap): string {
  if (gap.nextReviewAt !== undefined && gap.nextReviewAt <= Date.now()) return "Due now";
  if (gap.accuracy !== null && gap.accuracy < 50) return "Needs attention";
  if (gap.retention < 50) return "Fading";
  return "Building";
}

export default function LearningGaps({ onNavigate, onOpenConcept }: { onNavigate: (page: string) => void; onOpenConcept: (conceptId: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const refresh = useCallback(() => setNow(Date.now()), []);

  useEffect(() => {
    let cancelled = false;
    getAllNotes().then((notes) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const note of notes) {
        next[note.id] = note.title;
        next[ note.id + "::0" ] = note.title;
      }
      setLabels(next);
      setLoadError(false);
    }).catch(() => {
      if (!cancelled) setLoadError(true);
    });
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("studyvault:learning-updated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("studyvault:learning-updated", refresh);
    };
  }, [refresh]);

  const gaps = useMemo(() => {
    const mastery = getMastery();
    const events = getLearningEvents();
    const resolvedLabels: Record<string, string> = {};
    for (const [id, title] of Object.entries(labels)) resolvedLabels[id] = title;
    for (const id of Object.keys(mastery)) {
      if (!resolvedLabels[id]) {
        const noteId = id.split("::")[0];
        if (resolvedLabels[noteId]) resolvedLabels[id] = resolvedLabels[noteId];
      }
    }
    return buildLearningGaps(mastery, events, resolvedLabels, now);
  }, [labels, now]);

  const dueCount = gaps.filter((gap) => typeof gap.nextReviewAt === "number" && gap.nextReviewAt <= now).length;
  const weakCount = gaps.filter((gap) => gap.accuracy !== null && gap.accuracy < 60).length;
  const noEvidenceCount = gaps.filter((gap) => gap.attempts === 0).length;

  return (
    <div className="learning-gaps-page">
      <header className="learning-gaps-header">
        <div>
          <p className="learning-gaps-eyebrow"><Target size={14} /> MASTERY DIAGNOSTICS</p>
          <h1>Learning <em>gaps</em></h1>
          <p>Find the concepts that need attention next, using your saved recall attempts and review schedule.</p>
        </div>
        <button className="learning-gaps-refresh" onClick={refresh}><RefreshCw size={15} /> Refresh</button>
      </header>

      <section className="learning-gaps-stats" aria-label="Learning gap summary">
        <article><span><AlertTriangle size={17} /></span><small>Priority concepts</small><strong>{gaps.filter((gap) => gap.priority >= 50).length}</strong><p>Higher priority from recorded evidence</p></article>
        <article><span><Clock3 size={17} /></span><small>Due for review</small><strong>{dueCount}</strong><p>Saved review times at or before now</p></article>
        <article><span><BrainCircuit size={17} /></span><small>Accuracy below 60%</small><strong>{weakCount}</strong><p>Based on recorded outcomes only</p></article>
        <article><span><CheckCircle2 size={17} /></span><small>Not yet tested</small><strong>{noEvidenceCount}</strong><p>Tracked concepts with no attempts</p></article>
      </section>

      {loadError && <p className="learning-gaps-notice" role="status">Some note titles could not be loaded. Recorded concept identifiers are still shown where needed.</p>}

      {gaps.length === 0 ? (
        <section className="learning-gaps-empty">
          <span><BrainCircuit size={26} /></span>
          <h2>Your learning map starts with a review</h2>
          <p>Once you record recall attempts, this page will rank concepts by weak performance, estimated retention, review timing and confidence calibration. It will not invent gaps without evidence.</p>
          <button onClick={() => onNavigate("Review")}>Open Review <ArrowRight size={15} /></button>
        </section>
      ) : (
        <section className="learning-gaps-list" aria-label="Prioritized learning gaps">
          <div className="learning-gaps-list-heading"><div><p className="learning-gaps-eyebrow">NEXT BEST ACTIONS</p><h2>What needs attention</h2></div><span>{gaps.length} tracked concepts</span></div>
          {gaps.map((gap, index) => (
            <article className="learning-gap-card" key={gap.conceptId}>
              <div className="learning-gap-rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="learning-gap-main">
                <div className="learning-gap-title-row"><h3>{gap.label}</h3><span className={gap.priority >= 65 ? "learning-gap-status urgent" : "learning-gap-status"}>{statusLabel(gap)}</span></div>
                <p className="learning-gap-reason">{gap.reasons.join(" · ")}</p>
                <div className="learning-gap-metrics">
                  <span><small>Recall accuracy</small><strong>{gap.accuracy === null ? "No attempts" : `${gap.accuracy}%`}</strong></span>
                  <span><small>Est. retention</small><strong>{gap.attempts ? `${gap.retention}%` : "—"}</strong></span>
                  <span><small>Confidence gap</small><strong>{gap.confidence === null ? "—" : `${gap.calibration} pts`}</strong></span>
                  <span><small>Last reviewed</small><strong>{formatDate(gap.lastReviewedAt)}</strong></span>
                </div>
                <div className="learning-gap-next"><span>Suggested next action</span><strong>{gap.nextAction.label}</strong><p>{gap.nextAction.reason}</p></div>
              </div>
              <button className="learning-gap-open" onClick={() => onOpenConcept(gap.conceptId)} aria-label={`Review ${gap.label}`} title="Open this concept in Review"><ArrowRight size={17} /></button>
            </article>
          ))}
        </section>
      )}
      <p className="learning-gaps-footnote">Priority is a heuristic, not a grade. Retention is an estimate based on recorded mastery and time since review. Concepts without evidence are shown as untested, not as failed.</p>
    </div>
  );
}
