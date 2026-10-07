import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { getAllNotes } from "./services/noteStorage";
import type { Note } from "./types/note";
import type { Resource } from "./types/resource";
import type { Subject } from "./Subjects";

type ReviewProps = {
  resources: Resource[];
  subjects: Subject[];
};

type Rating = "again" | "hard" | "good" | "easy";

type ReviewState = {
  level: number;
  nextReviewAt: number;
  lastReviewedAt: number;
};

const STORAGE_KEY = "studyvault-review-v1";
const INTERVALS_MS = [
  10 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];

function readReviewState(): Record<string, ReviewState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, ReviewState> : {};
  } catch {
    return {};
  }
}

function writeReviewState(state: Record<string, ReviewState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Review scheduling is an enhancement; note content remains in IndexedDB.
  }
}

function formatInterval(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function formatDate(value: number): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function Review({ subjects }: ReviewProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [reviewState, setReviewState] = useState<Record<string, ReviewState>>(() => readReviewState());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recall, setRecall] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAllNotes()
      .then((loaded) => {
        if (!cancelled) setNotes(loaded.filter((note) => note.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const now = Date.now();

  const dueNotes = useMemo(() => notes
    .filter((note) => {
      const state = reviewState[note.id];
      return !state || state.nextReviewAt <= now;
    })
    .sort((a, b) => {
      const aState = reviewState[a.id];
      const bState = reviewState[b.id];
      const aDue = aState?.nextReviewAt ?? new Date(a.createdAt).getTime();
      const bDue = bState?.nextReviewAt ?? new Date(b.createdAt).getTime();
      return aDue - bDue;
    }), [notes, reviewState, now]);

  useEffect(() => {
    if (!selectedId || !dueNotes.some((note) => note.id === selectedId)) {
      setSelectedId(dueNotes[0]?.id ?? null);
      setRecall("");
      setRevealed(false);
    }
  }, [dueNotes, selectedId]);

  const selected = dueNotes.find((note) => note.id === selectedId) ?? null;
  const subjectName = selected?.subjectId === undefined
    ? undefined
    : subjects.find((subject) => subject.id === selected.subjectId)?.name;

  const rate = (rating: Rating) => {
    if (!selected) return;
    const previous = reviewState[selected.id];
    const previousLevel = previous?.level ?? 0;
    let level = previousLevel;
    let interval: number;

    if (rating === "again") {
      level = Math.max(0, previousLevel - 1);
      interval = INTERVALS_MS[0];
    } else if (rating === "hard") {
      interval = INTERVALS_MS[Math.min(level, INTERVALS_MS.length - 1)];
    } else if (rating === "good") {
      level = Math.min(previousLevel + 1, INTERVALS_MS.length - 1);
      interval = INTERVALS_MS[level];
    } else {
      level = Math.min(previousLevel + 2, INTERVALS_MS.length - 1);
      interval = INTERVALS_MS[level];
    }

    const next = {
      ...reviewState,
      [selected.id]: {
        level,
        nextReviewAt: Date.now() + interval,
        lastReviewedAt: Date.now(),
      },
    };
    setReviewState(next);
    writeReviewState(next);
    setRecall("");
    setRevealed(false);
    setSelectedId(null);
  };

  if (isLoading) {
    return <div className="review-page"><div className="content-card"><p>Loading review queue…</p></div></div>;
  }

  return (
    <div className="review-page">
      <div className="review-heading">
        <div>
          <p className="eyebrow">EVIDENCE-INFORMED STUDY MODE</p>
          <h1>Review</h1>
          <p className="review-subtitle">
            Recall first, check your notes second, then space the next review.
            This turns StudyVault from a storage system into a learning system.
          </p>
        </div>
        <div className="review-progress">
          <strong>{dueNotes.length} due now</strong>
          <span>{notes.length} active notes in your review system</span>
        </div>
      </div>

      <div className="review-layout">
        <section className="review-card">
          {!selected ? (
            <div className="review-empty">
              <div className="review-empty-icon"><CheckCircle2 size={24} /></div>
              <h2>You're caught up 🎉</h2>
              <p>
                No notes are due right now. Come back when the next review is scheduled.
                Spacing is intentionally used instead of asking you to reread everything every day.
              </p>
            </div>
          ) : (
            <>
              <div className="review-kicker">Active recall</div>
              <h2>{selected.title}</h2>
              <div className="review-meta">
                {subjectName && <span className="review-chip">{subjectName}</span>}
                {selected.tags.slice(0, 4).map((tag) => <span className="review-chip" key={tag}>#{tag}</span>)}
                <span className="review-chip">Review #{(reviewState[selected.id]?.level ?? 0) + 1}</span>
              </div>

              <p className="review-prompt">Without opening the note, what can you explain from memory?</p>
              <p className="review-hint">
                Write the key ideas, definitions, relationships, examples or steps you remember.
                Don't worry about perfect wording.
              </p>
              <textarea
                className="review-recall"
                value={recall}
                onChange={(event) => setRecall(event.target.value)}
                placeholder="Write what you remember…"
                aria-label="Active recall answer"
              />

              <button
                type="button"
                className="secondary-button"
                style={{ marginTop: 12 }}
                onClick={() => setRevealed(true)}
                disabled={revealed}
              >
                <RotateCcw size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
                {revealed ? "Answer revealed" : "Reveal my note"}
              </button>

              {revealed && (
                <div className="review-reveal">
                  <strong>Compare with your memory</strong>
                  <p>{selected.plainText || "This note has no plain-text content yet."}</p>
                </div>
              )}

              <div className="review-actions">
                <button className="review-rating" type="button" onClick={() => rate("again")}>Again · 10 min</button>
                <button className="review-rating" type="button" onClick={() => rate("hard")}>Hard · {formatInterval(INTERVALS_MS[Math.min(reviewState[selected.id]?.level ?? 0, INTERVALS_MS.length - 1)])}</button>
                <button className="review-rating primary" type="button" onClick={() => rate("good")}>Good · next interval</button>
                <button className="review-rating" type="button" onClick={() => rate("easy")}>Easy · skip ahead</button>
              </div>
            </>
          )}
        </section>

        <aside className="review-side">
          <div className="review-side-card">
            <h3><BrainCircuit size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Why this exists</h3>
            <p>
              Research consistently favors retrieval practice and distributed practice over
              passive rereading. The goal is not more time in the app; it is better memory per session.
            </p>
          </div>
          <div className="review-side-card">
            <h3><Sparkles size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Spacing ladder</h3>
            <div className="review-intervals">
              {INTERVALS_MS.map((interval, index) => (
                <div className="review-interval" key={interval}>
                  <span>Level {index + 1}</span>
                  <strong>{formatInterval(interval)}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="review-side-card">
            <h3>How to use it</h3>
            <p>
              1. Recall before revealing.<br />
              2. Compare your answer with the note.<br />
              3. Rate honestly.<br />
              4. Return when the next interval arrives.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
