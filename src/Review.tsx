import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { getAllNotes } from "./services/noteStorage";
import type { Note, TipTapNode } from "./types/note";
import type { Resource } from "./types/resource";
import type { Subject } from "./Subjects";
import { chooseNextInterval, masteryPercent, recordLearningEvent, recordMasteryLevel, getMastery, getNextBestAction, type QuestionType } from "./services/learningCore";

type ReviewProps = {
  resources: Resource[];
  subjects: Subject[];
  focusNoteId?: string | null;
};

type Rating = "again" | "hard" | "good" | "easy";

type ReviewState = {
  level: number;
  nextReviewAt: number;
  lastReviewedAt: number;
  streak: number;
  attempts: number;
};

type ReviewBlock = {
  kind: "heading" | "text";
  text: string;
};

type ReviewConcept = {
  id: string;
  noteId: string;
  noteTitle: string;
  title: string;
  prompt: string;
  answer: string;
  index: number;
  totalInNote: number;
  subjectName?: string;
  tags: string[];
};

const STORAGE_KEY = "studyvault-review-v2";
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
    // Note content remains safe in IndexedDB even if scheduling cannot be saved.
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

function getNodeText(node: TipTapNode): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(getNodeText).join(" ").replace(/\s+/g, " ").trim();
}

function collectBlocks(nodes: TipTapNode[], blocks: ReviewBlock[] = []): ReviewBlock[] {
  for (const node of nodes) {
    if (node.type === "heading") {
      const text = getNodeText(node);
      if (text) blocks.push({ kind: "heading", text });
      continue;
    }

    if (node.type === "paragraph" || node.type === "list_item" || node.type === "blockquote" || node.type === "codeBlock") {
      const text = getNodeText(node);
      if (text) blocks.push({ kind: "text", text });
      continue;
    }

    if (node.content) collectBlocks(node.content, blocks);
  }
  return blocks;
}

function splitLongText(text: string, maxChars = 850): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxChars) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  if (chunks.length > 1) return chunks;

  const words = text.split(/\s+/);
  const fallback: string[] = [];
  let wordChunk = "";
  for (const word of words) {
    if (wordChunk && wordChunk.length + word.length + 1 > maxChars) {
      fallback.push(wordChunk);
      wordChunk = word;
    } else {
      wordChunk = wordChunk ? `${wordChunk} ${word}` : word;
    }
  }
  if (wordChunk) fallback.push(wordChunk);
  return fallback;
}

function buildConcepts(note: Note, subjectName?: string): ReviewConcept[] {
  const blocks = collectBlocks(note.content.content);
  const concepts: Omit<ReviewConcept, "index" | "totalInNote">[] = [];

  const hasHeadings = blocks.some((block) => block.kind === "heading");
  if (hasHeadings) {
    let currentTitle = note.title;
    let currentBlocks: string[] = [];

    const flush = () => {
      if (!currentBlocks.length) return;
      const chunks = splitLongText(currentBlocks.join("\n\n"));
      chunks.forEach((answer, chunkIndex) => {
        const suffix = chunks.length > 1 ? ` · Part ${chunkIndex + 1}` : "";
        concepts.push({
          id: `${note.id}::${concepts.length}`,
          noteId: note.id,
          noteTitle: note.title,
          title: `${currentTitle}${suffix}`,
          prompt: `Explain ${currentTitle}${suffix} in your own words. Include the key ideas, relationships, and an example if you can.`,
          answer,
          subjectName,
          tags: note.tags,
        });
      });
      currentBlocks = [];
    };

    for (const block of blocks) {
      if (block.kind === "heading") {
        flush();
        currentTitle = block.text;
      } else {
        currentBlocks.push(block.text);
      }
    }
    flush();
  } else {
    const paragraphs = blocks.map((block) => block.text);
    const chunks: string[] = [];
    let current = "";

    for (const paragraph of paragraphs) {
      if (current && current.length + paragraph.length + 2 > 850) {
        chunks.push(current.trim());
        current = paragraph;
      } else {
        current = current ? `${current}\n\n${paragraph}` : paragraph;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    if (!chunks.length && note.plainText.trim()) {
      chunks.push(...splitLongText(note.plainText.trim()));
    }

    chunks.forEach((answer, index) => {
      concepts.push({
        id: `${note.id}::${index}`,
        noteId: note.id,
        noteTitle: note.title,
        title: chunks.length > 1 ? `${note.title} · Part ${index + 1}` : note.title,
        prompt: `What are the most important ideas from this part of the note? Explain them from memory rather than trying to reproduce the wording.`,
        answer,
        subjectName,
        tags: note.tags,
      });
    });
  }

  const total = concepts.length;
  return concepts.map((concept, index) => ({ ...concept, index: index + 1, totalInNote: total }));
}

export default function Review({ subjects, focusNoteId }: ReviewProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [reviewState, setReviewState] = useState<Record<string, ReviewState>>(() => readReviewState());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recall, setRecall] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<"recall" | "questions">("recall");
  const [confidence, setConfidence] = useState(0);
  const [outcome, setOutcome] = useState<"correct" | "partial" | "incorrect" | null>(null);

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

    return () => {
      cancelled = true;
    };
  }, []);

  const concepts = useMemo(
    () => notes.flatMap((note) => {
      const subjectName = note.subjectId === undefined
        ? undefined
        : subjects.find((subject) => subject.id === note.subjectId)?.name;
      return buildConcepts(note, subjectName);
    }),
    [notes, subjects],
  );

  const now = Date.now();

  const dueConcepts = useMemo(
    () => concepts
      .filter((concept) => {
        if (focusNoteId && concept.noteId !== focusNoteId) return false;
        if (focusNoteId) return true;
        const state = reviewState[concept.id];
        return !state || state.nextReviewAt <= now;
      })
      .sort((a, b) => {
        const aState = reviewState[a.id];
        const bState = reviewState[b.id];
        const aDue = aState?.nextReviewAt ?? 0;
        const bDue = bState?.nextReviewAt ?? 0;
        return aDue - bDue;
      }),
    [concepts, reviewState, now],
  );

  useEffect(() => {
    if (!selectedId || !dueConcepts.some((concept) => concept.id === selectedId)) {
      setSelectedId(dueConcepts[0]?.id ?? null);
      setRecall("");
      setRevealed(false);
      setConfidence(0);
      setOutcome(null);
    }
  }, [dueConcepts, selectedId]);

  const selected = dueConcepts.find((concept) => concept.id === selectedId) ?? null;
  const currentState = selected ? reviewState[selected.id] : undefined;

  const reveal = () => {
    if (!recall.trim()) return;
    setRevealed(true);
  };

  const questionType: QuestionType =
    mode === "questions"
      ? (selected?.title.toLowerCase().includes("why") ? "why" : "recall")
      : "recall";

  const rate = (rating: Rating) => {
    if (!selected || !revealed || !outcome || confidence === 0) return;

    const previous = reviewState[selected.id];
    const previousLevel = previous?.level ?? 0;
    const timestamp = Date.now();
    const interval = chooseNextInterval(outcome, confidence * 20, previousLevel);
    const level = outcome === "incorrect"
      ? 0
      : outcome === "partial"
        ? previousLevel
        : Math.min(previousLevel + (rating === "easy" ? 2 : 1), INTERVALS_MS.length - 1);
    const streak = outcome === "correct" ? (previous?.streak ?? 0) + 1 : 0;

    const next = {
      ...reviewState,
      [selected.id]: {
        level,
        nextReviewAt: timestamp + interval,
        lastReviewedAt: timestamp,
        streak,
        attempts: (previous?.attempts ?? 0) + 1,
      },
    };

    setReviewState(next);
    writeReviewState(next);
    recordLearningEvent({
      conceptId: selected.id,
      questionType,
      outcome,
      confidence: confidence * 20,
      at: timestamp,
    });
    recordMasteryLevel(selected.id, level);
    setRecall("");
    setRevealed(false);
    setConfidence(0);
    setOutcome(null);
    setSelectedId(null);
  };

  if (isLoading) {
    return (
      <div className="review-page">
        <div className="content-card"><p>Building your review queue…</p></div>
      </div>
    );
  }

  const totalDue = dueConcepts.length;
  const reviewedConcepts = concepts.filter((concept) => reviewState[concept.id]?.lastReviewedAt).length;
  const mastery = getMastery();
  const learnedConcepts = concepts.filter((concept) => masteryPercent(mastery[concept.id]) >= 70).length;
  const nextAction = selected ? getNextBestAction(mastery[selected.id]) : null;

  return (
    <div className="review-page">
      <div className="review-v2-header">
        <div>
          <p className="eyebrow">RETRIEVAL + SPACING WORKSPACE</p>
          <h1>Review</h1>
          <p className="review-v2-subtitle">
            StudyVault turns long notes into small, retrievable concepts. Recall first, get feedback second,
            then revisit the same concept after a delay.
          </p>
          <div className="review-mode-switch" role="tablist" aria-label="Review mode">
            <button
              type="button"
              className={mode === "recall" ? "active" : ""}
              onClick={() => { setMode("recall"); setRecall(""); setRevealed(false); }}
              role="tab"
              aria-selected={mode === "recall"}
            >
              Active recall
            </button>
            <button
              type="button"
              className={mode === "questions" ? "active" : ""}
              onClick={() => { setMode("questions"); setRecall(""); setRevealed(false); }}
              role="tab"
              aria-selected={mode === "questions"}
            >
              Questions
            </button>
          </div>
        </div>

        <div className="review-v2-stats">
          <div><strong>{totalDue}</strong><span>due now</span></div>
          <div><strong>{reviewedConcepts}</strong><span>reviewed</span></div>
          <div><strong>{learnedConcepts}</strong><span>well practiced</span></div>
        </div>
      </div>

      <div className="review-v2-layout">
        <section className="review-v2-main">
          {!selected ? (
            <div className="review-v2-empty">
              <div className="review-v2-empty-icon"><CheckCircle2 size={26} /></div>
              <h2>{concepts.length ? "You're caught up 🎉" : "Your review system is ready"}</h2>
              <p>
                {concepts.length
                  ? "Nothing is due right now. Spacing deliberately gives your memory time to work between retrieval sessions."
                  : "Create an active note first. StudyVault will automatically turn its sections into reviewable concepts."}
              </p>
            </div>
          ) : (
            <>
              <div className="review-v2-topline">
                <div className="review-v2-source">
                  <span className="review-v2-source-label">FROM NOTE</span>
                  <strong>{selected.noteTitle}</strong>
                </div>
                <div className="review-v2-progress">
                  Concept {selected.index} of {selected.totalInNote}
                </div>
              </div>

              <div className="review-v2-concept">
                <div className="review-v2-kicker"><Target size={15} /> Active recall</div>
                <h2>{selected.title}</h2>

                <div className="review-v2-meta">
                  {selected.subjectName && <span>{selected.subjectName}</span>}
                  {selected.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}
                  {currentState && <span>Streak {currentState.streak}</span>}
                  {mastery[selected.id] && <span>Mastery {masteryPercent(mastery[selected.id])}%</span>}
                </div>

                {nextAction && (
                  <div className="review-v2-next-action">
                    <div>
                      <span className="review-v2-next-action-kicker">ADAPTIVE NEXT STEP</span>
                      <strong>{nextAction.label}</strong>
                      <p>{nextAction.reason}</p>
                    </div>
                    <span className="review-v2-next-action-dimension">{nextAction.dimension}</span>
                  </div>
                )}

                <div className="review-v2-question">
                  <strong>
                    {mode === "questions"
                      ? `Imagine you studied this ${focusNoteId ? "today" : "earlier"} and now you've forgotten it. What is ${selected.title}? Explain it as if someone asked you in an exam or viva.`
                      : selected.prompt}
                  </strong>
                  <p>
                    {mode === "questions"
                      ? "Answer from memory. Start with the definition or core idea, then add key points, steps, relationships, or an example."
                      : "Try to reconstruct the idea from memory. Don't copy the note and don't worry about exact wording."}
                  </p>
                </div>

                <textarea
                  className="review-v2-recall"
                  value={recall}
                  onChange={(event) => setRecall(event.target.value)}
                  placeholder="Write what you can explain from memory…"
                  aria-label="Active recall answer"
                  disabled={revealed}
                />

                <div className="review-v2-confidence">
                  <div>
                    <strong>How confident were you before seeing the reference?</strong>
                    <span>This measures calibration, not intelligence.</span>
                  </div>
                  <div className="review-v2-confidence-buttons">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} type="button" className={confidence === value ? "selected" : ""} onClick={() => setConfidence(value)}>
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                {revealed && (
                  <div className="review-v2-outcome">
                    <strong>After comparing, how did the retrieval go?</strong>
                    <div>
                      <button type="button" className={outcome === "incorrect" ? "selected" : ""} onClick={() => setOutcome("incorrect")}>Missed it</button>
                      <button type="button" className={outcome === "partial" ? "selected" : ""} onClick={() => setOutcome("partial")}>Partly knew it</button>
                      <button type="button" className={outcome === "correct" ? "selected" : ""} onClick={() => setOutcome("correct")}>Got it</button>
                    </div>
                  </div>
                )}

                <div className="review-v2-controls">
                  <button
                    type="button"
                    className="review-v2-reveal"
                    onClick={reveal}
                    disabled={!recall.trim() || revealed}
                  >
                    {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                    {revealed ? "Reference shown" : "Reveal reference"}
                  </button>

                  <span className="review-v2-rule">
                    <Clock3 size={14} />
                    Recall before feedback
                  </span>
                </div>
              </div>

              {revealed && (
                <div className="review-v2-compare">
                  <div className="review-v2-panel your-memory">
                    <div className="review-v2-panel-heading">
                      <span>YOUR RECALL</span>
                      <strong>{recall.trim().split(/\s+/).filter(Boolean).length} words</strong>
                    </div>
                    <p>{recall.trim()}</p>
                  </div>

                  <div className="review-v2-panel reference">
                    <div className="review-v2-panel-heading">
                      <span>REFERENCE FOR THIS CONCEPT</span>
                      <strong>Not the whole note</strong>
                    </div>
                    <p>{selected.answer}</p>
                  </div>
                </div>
              )}

              <div className="review-v2-rating">
                <div>
                  <strong>How well did you retrieve it?</strong>
                  <span>Rate your memory, not your writing quality.</span>
                </div>
                <div className="review-v2-rating-buttons">
                  <button type="button" disabled={!revealed || !outcome || confidence === 0} onClick={() => rate("again")}>
                    <span>Again</span><small>10 min</small>
                  </button>
                  <button type="button" disabled={!revealed || !outcome || confidence === 0} onClick={() => rate("hard")}>
                    <span>Hard</span><small>{formatInterval(INTERVALS_MS[Math.min(currentState?.level ?? 0, INTERVALS_MS.length - 1)])}</small>
                  </button>
                  <button type="button" className="good" disabled={!revealed || !outcome || confidence === 0} onClick={() => rate("good")}>
                    <span>Good</span><small>next interval</small>
                  </button>
                  <button type="button" disabled={!revealed || !outcome || confidence === 0} onClick={() => rate("easy")}>
                    <span>Easy</span><small>skip ahead</small>
                  </button>
                </div>
              </div>

              <div className="review-v2-next">
                <Sparkles size={15} />
                <span>Next: another concept. The queue keeps long notes broken into manageable retrieval targets.</span>
                <ChevronRight size={15} />
              </div>
            </>
          )}
        </section>

        <aside className="review-v2-sidebar">
          <div className="review-v2-side-card">
            <h3><BrainCircuit size={17} /> Why this design</h3>
            <p>
              Retrieval practice is one of the strongest-supported learning techniques. A 2021 review
              coded 50 real classroom experiments (5,374 learners), with 57% showing medium or large
              retrieval benefits. A 2017 meta-analysis of 118 articles and 15,427 participants also found
              practice testing beneficial versus non-testing conditions.
            </p>
          </div>

          <div className="review-v2-side-card">
            <h3><RotateCcw size={17} /> Feedback matters</h3>
            <p>
              You don't just reveal an answer. You compare your recall with a focused reference excerpt.
              Recent meta-analytic work found the retrieval advantage was stronger when corrective feedback
              was provided.
            </p>
          </div>

          <div className="review-v2-side-card">
            <h3><Clock3 size={17} /> Spaced, not crammed</h3>
            <div className="review-v2-intervals">
              {INTERVALS_MS.map((interval, index) => (
                <div key={interval}><span>Level {index + 1}</span><strong>{formatInterval(interval)}</strong></div>
              ))}
            </div>
            <p className="review-v2-small">
              These intervals are a practical product schedule, not a claim that one exact ladder is universally optimal.
            </p>
          </div>

          <div className="review-v2-side-card review-v2-principles">
            <h3><Target size={17} /> The rule</h3>
            <ol>
              <li>Recall without looking.</li>
              <li>Compare with the focused reference.</li>
              <li>Notice what you missed.</li>
              <li>Rate honestly.</li>
              <li>Return after spacing.</li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
