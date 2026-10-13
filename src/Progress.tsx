import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity, ArrowRight, BookOpen, CheckCircle2, Clock3, Flame,
  Gauge, NotebookPen, RefreshCw, Sparkles, Target, TrendingUp,
} from "lucide-react";
import { getAllNotes } from "./services/noteStorage";
import type { Note } from "./types/note";
import type { Subject } from "./Subjects";
import {
  getLearningEvents, getMastery, masteryPercent,
  type LearningEvent,
} from "./services/learningCore";

type ReviewEntry = {
  level?: number;
  nextReviewAt?: number;
  lastReviewedAt?: number;
  streak?: number;
  attempts?: number;
};

type ProgressProps = { subjects: Subject[]; onOpenReview: () => void };

const REVIEW_STATE_KEY = "studyvault-review-v2";

function readReviewState(): Record<string, ReviewEntry> {
  try {
    const raw = localStorage.getItem(REVIEW_STATE_KEY);
    return raw ? JSON.parse(raw) as Record<string, ReviewEntry> : {};
  } catch {
    return {};
  }
}

function plainText(note: Note): string {
  return note.plainText?.trim() ?? "";
}

function noteConceptIds(note: Note): string[] {
  // Keep concept IDs aligned with Review's noteId::index convention.
  const headings: string[] = [];
  const paragraphs: string[] = [];
  const visit = (nodes: Note["content"]["content"]) => {
    for (const node of nodes) {
      const text = node.text ?? (node.content ?? []).map((child) => child.text ?? "").join(" ");
      if (node.type === "heading" && text.trim()) headings.push(text.trim());
      else if (["paragraph", "list_item", "blockquote", "codeBlock"].includes(node.type) && text.trim()) paragraphs.push(text.trim());
      if (node.content) visit(node.content as Note["content"]["content"]);
    }
  };
  visit(note.content?.content ?? []);

  let count = 0;
  if (headings.length) {
    // Review creates one concept for each non-empty section after a heading.
    const nodes = note.content?.content ?? [];
    let hasHeading = false;
    let sectionHasText = false;
    const walk = (items: Note["content"]["content"]) => {
      for (const node of items) {
        if (node.type === "heading") {
          if (sectionHasText) count += 1;
          hasHeading = true;
          sectionHasText = false;
        } else if (["paragraph", "list_item", "blockquote", "codeBlock"].includes(node.type)) {
          const text = node.text ?? (node.content ?? []).map((child) => child.text ?? "").join(" ");
          if (text.trim()) sectionHasText = true;
        }
        if (node.content) walk(node.content as Note["content"]["content"]);
      }
    };
    walk(nodes);
    if (sectionHasText) count += 1;
    if (!hasHeading) count = 0;
  } else {
    const text = plainText(note);
    count = text ? Math.max(1, Math.ceil(text.length / 850)) : 0;
  }
  return Array.from({ length: count }, (_, index) => `${note.id}::${index}`);
}

function percent(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function ProgressRing({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-ring" style={{ "--progress-value": safe } as CSSProperties} role="img" aria-label={`${safe}% of notes reviewed`}>
      <div className="progress-ring-inner">
        <strong>{safe}%</strong>
        <span>reviewed</span>
      </div>
    </div>
  );
}

export default function Progress({ subjects, onOpenReview }: ProgressProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [reviewState, setReviewState] = useState<Record<string, ReviewEntry>>(() => readReviewState());
  const [events, setEvents] = useState<LearningEvent[]>(() => getLearningEvents());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAllNotes()
      .then((loaded) => { if (!cancelled) setNotes(loaded.filter((note) => note.status === "active")); })
      .catch(() => { if (!cancelled) setNotes([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setReviewState(readReviewState());
      setEvents(getLearningEvents());
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const concepts = useMemo(() => notes.flatMap((note) => noteConceptIds(note).map((id) => ({ id, note }))), [notes]);
  const reviewedIds = useMemo(() => new Set(concepts.filter(({ id }) => Boolean(reviewState[id]?.lastReviewedAt)).map(({ id }) => id)), [concepts, reviewState]);
  const reviewedCount = reviewedIds.size;
  const totalConcepts = concepts.length;
  const reviewPercent = percent(reviewedCount, totalConcepts);
  const dueCount = concepts.filter(({ id }) => {
    const state = reviewState[id];
    return !state?.lastReviewedAt || (state.nextReviewAt ?? 0) <= Date.now();
  }).length;
  const totalAttempts = Object.values(reviewState).reduce((sum, item) => sum + (item.attempts ?? 0), 0);
  const studiedNotes = new Set(concepts.filter(({ id }) => reviewState[id]?.lastReviewedAt).map(({ note }) => note.id));
  const notesWithContent = notes.filter((note) => plainText(note).length > 0).length;
  const mastery = getMastery();\n  const masteredConcepts = concepts.filter(({ id }) => masteryPercent(mastery[id]) >= 70).length;
  const outcomeTotals = events.reduce((totals, event) => {
    totals[event.outcome] += 1;
    return totals;
  }, { correct: 0, partial: 0, incorrect: 0 });
  const scoredEvents = outcomeTotals.correct + outcomeTotals.partial + outcomeTotals.incorrect;
  const performance = scoredEvents ? Math.round(((outcomeTotals.correct + outcomeTotals.partial * 0.5) / scoredEvents) * 100) : null;
  const recentEvents = events.filter((event) => event.at >= Date.now() - 7 * 24 * 60 * 60 * 1000).length;

  const subjectProgress = subjects.map((subject) => {
    const subjectNotes = notes.filter((note) => note.subjectId === subject.id);
    const subjectConcepts = concepts.filter(({ note }) => note.subjectId === subject.id);
    const reviewed = subjectConcepts.filter(({ id }) => reviewState[id]?.lastReviewedAt).length;
    return {
      id: subject.id,
      name: subject.name,
      noteCount: subjectNotes.length,
      concepts: subjectConcepts.length,
      reviewed,
      value: percent(reviewed, subjectConcepts.length),
    };
  }).filter((subject) => subject.noteCount > 0 || subject.concepts > 0);

  const feedback = scoredEvents === 0
    ? "Your feedback summary will appear after your first review session. Start with one note and test what you can recall."
    : performance !== null && performance >= 80
      ? "Your recent recall is strong. Keep spaced reviews on schedule and revisit difficult concepts so progress remains durable."
      : performance !== null && performance >= 55
        ? "You're building recall, with some gaps still showing. Revisit partial answers and practise explaining concepts without looking."
        : "Treat missed and partial answers as a useful map. Short, frequent recall sessions will help you identify and strengthen weak areas.";

  if (isLoading) {
    return <div className="progress-page"><div className="progress-card"><p>Gathering your learning activity…</p></div></div>;
  }

  return (
    <div className="progress-page">
      <header className="progress-header">
        <div>
          <span className="progress-eyebrow">YOUR LEARNING JOURNEY</span>
          <h1>Progress <em>& feedback</em></h1>
          <p>A clear view of what you've studied, what you've reviewed, and what needs attention next.</p>
        </div>
        <div className="progress-live"><span /> Based on your saved activity</div>
      </header>

      <section className="progress-overview">
        <div className="progress-overview-copy">
          <span className="progress-eyebrow">REVIEW COVERAGE</span>
          <h2>{reviewPercent === 100 && totalConcepts > 0 ? "Everything reviewed." : reviewedCount > 0 ? "Keep building momentum." : "Your journey starts here."}</h2>
          <p>{totalConcepts === 0 ? "Add useful notes with content, then open Review to practise recall. Your progress will grow from real review activity." : `${reviewedCount} of ${totalConcepts} review concepts have been practised at least once.`}</p>
          <div className="progress-overview-meta"><span><CheckCircle2 size={15} /> {reviewedCount} reviewed</span><span><Clock3 size={15} /> {Math.max(0, totalConcepts - reviewedCount)} not yet reviewed</span></div>
        </div>
        <ProgressRing value={reviewPercent} />
      </section>

      <section className="progress-metric-grid" aria-label="Learning statistics">
        <article className="progress-card progress-metric">
          <span className="progress-metric-icon"><NotebookPen size={18} /></span>
          <span className="progress-metric-label">Notes with content</span>
          <strong>{notesWithContent}<small> / {notes.length}</small></strong>
          <p>Saved active notes containing text</p>
        </article>
        <article className="progress-card progress-metric">
          <span className="progress-metric-icon"><RefreshCw size={18} /></span>
          <span className="progress-metric-label">Review attempts</span>
          <strong>{totalAttempts}</strong>
          <p>Recorded spaced-repetition ratings</p>
        </article>
        <article className="progress-card progress-metric">
          <span className="progress-metric-icon"><Target size={18} /></span>
          <span className="progress-metric-label">Mastered concepts</span>
          <strong>{masteredConcepts}<small> / {totalConcepts}</small></strong>
          <p>At least 70% recorded mastery score</p>
        </article>
        <article className="progress-card progress-metric">
          <span className="progress-metric-icon"><Flame size={18} /></span>
          <span className="progress-metric-label">Last 7 days</span>
          <strong>{recentEvents}</strong>
          <p>Learning outcomes recorded this week</p>
        </article>
      </section>

      <section className="progress-section">
        <div className="progress-section-heading">
          <div><span className="progress-eyebrow">BY SUBJECT</span><h2>Where you're making progress</h2></div>
          <span className="progress-section-note">Reviewed concepts / available concepts</span>
        </div>
        {subjectProgress.length === 0 ? (
          <div className="progress-card progress-empty"><BookOpen size={24} /><h3>No subject activity yet</h3><p>Create a note, assign it to a subject, and review it to see subject-level progress here.</p></div>
        ) : (
          <div className="progress-subject-list">
            {subjectProgress.map((subject) => (
              <article className="progress-card progress-subject" key={subject.id}>
                <div className="progress-subject-top"><div><h3>{subject.name}</h3><p>{subject.noteCount} {subject.noteCount === 1 ? "note" : "notes"} · {subject.concepts} review {subject.concepts === 1 ? "concept" : "concepts"}</p></div><strong>{subject.value}%</strong></div>
                <div className="progress-track" role="progressbar" aria-label={`${subject.name} review coverage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={subject.value}><span style={{ width: `${subject.value}%` }} /></div>
                <div className="progress-subject-foot"><span>{subject.reviewed} reviewed</span><span>{Math.max(0, subject.concepts - subject.reviewed)} remaining</span></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="progress-lower-grid">
        <article className="progress-card progress-feedback-card">
          <div className="progress-card-heading"><span className="progress-metric-icon"><Sparkles size={18} /></span><div><span className="progress-eyebrow">OVERALL FEEDBACK</span><h2>{performance === null ? "Waiting for your first session" : performance >= 80 ? "Strong recall signals" : performance >= 55 ? "Progress with room to grow" : "A useful place to focus"}</h2></div></div>
          <p>{feedback}</p>
          <div className="progress-feedback-score">
            <span>Recall performance</span>
            <strong>{performance === null ? "Not enough data" : `${performance}%`}</strong>
          </div>
          <div className="progress-feedback-breakdown">
            <span><i className="feedback-dot correct" /> {outcomeTotals.correct} correct</span>
            <span><i className="feedback-dot partial" /> {outcomeTotals.partial} partial</span>
            <span><i className="feedback-dot incorrect" /> {outcomeTotals.incorrect} incorrect</span>
          </div>
          <small className="progress-disclaimer">Calculated from saved review outcomes; partial answers count as half credit. This is a learning signal, not a grade.</small>
        </article>

        <article className="progress-card progress-next-card">
          <div className="progress-card-heading"><span className="progress-metric-icon"><Activity size={18} /></span><div><span className="progress-eyebrow">NEXT BEST STEP</span><h2>{dueCount > 0 ? "Continue your review" : "You're up to date"}</h2></div></div>
          <p>{totalConcepts === 0 ? "Write a note with meaningful content to create review material." : dueCount > 0 ? `${dueCount} concepts are new or due for another review.` : "No concepts are currently due based on your saved review schedule."}</p>
          <div className="progress-next-stat"><Gauge size={18} /><span>{totalConcepts - reviewedCount} concepts have not yet been reviewed</span></div>
          <button className="progress-cta" onClick={onOpenReview}>Open Review <ArrowRight size={16} /></button>
        </article>
      </section>
    </div>
  );
}
