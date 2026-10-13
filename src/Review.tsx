import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
  Target,
  SlidersHorizontal,
} from "lucide-react";
import { getAllNotes } from "./services/noteStorage";
import type { Note, TipTapNode } from "./types/note";
import type { Resource } from "./types/resource";
import type { Subject } from "./Subjects";
import { chooseNextInterval, masteryPercent, recordLearningEvent, recordMasteryLevel, getMastery, getAdaptiveAction, learningPriority, retentionEstimate, calibrationGap, averageEvidence, type QuestionType } from "./services/learningCore";

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
  const [questionMode, setQuestionMode] = useState<"recall" | "questions">("recall");
  const [reviewMode, setReviewMode] = useState<"custom" | "due" | "smart">("custom");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [conceptFilter, setConceptFilter] = useState<"weak" | "all" | "new">("weak");
  const [sessionSize, setSessionSize] = useState("10");
  const [sessionReviewedIds, setSessionReviewedIds] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
        const aPriority = learningPriority(getMastery()[a.id], now);
        const bPriority = learningPriority(getMastery()[b.id], now);
        return bPriority - aPriority || aDue - bDue;
      }),
    [concepts, reviewState, now, focusNoteId],
  );

  const availableConcepts = useMemo(() => {
    const masteryById = getMastery();
    const source = reviewMode === "custom" ? concepts : dueConcepts;
    return source
      .filter((concept) => !sessionReviewedIds.includes(concept.id))
      .filter((concept) => !focusNoteId || concept.noteId === focusNoteId)
      .filter((concept) => subjectFilter === "all" || concept.subjectName === subjectFilter)
      .filter((concept) => {
        const record = masteryById[concept.id];
        if (conceptFilter === "new") return !record || record.attempts === 0;
        if (conceptFilter === "weak") {
          if (!record || record.attempts === 0) return true;
          return masteryPercent(record) < 70 || record.lastOutcome === "incorrect" || record.lastOutcome === "partial";
        }
        return true;
      })
      .sort((a, b) => {
        if (reviewMode === "smart") return learningPriority(masteryById[b.id], now) - learningPriority(masteryById[a.id], now);
        if (reviewMode === "due") return (reviewState[a.id]?.nextReviewAt ?? 0) - (reviewState[b.id]?.nextReviewAt ?? 0);
        return a.noteTitle.localeCompare(b.noteTitle) || a.index - b.index;
      })
      .slice(0, sessionSize === "all" ? undefined : Number(sessionSize));
  }, [concepts, dueConcepts, focusNoteId, subjectFilter, conceptFilter, reviewMode, reviewState, now, sessionSize, sessionReviewedIds]);

  const selected = availableConcepts.find((concept) => concept.id === selectedId) ?? availableConcepts[0] ?? null;
  const currentState = selected ? reviewState[selected.id] : undefined;

  const reveal = () => {
    if (!recall.trim()) return;
    setRevealed(true);
  };

  const selectedMastery = selected ? getMastery()[selected.id] : undefined;
  const adaptiveAction = selected ? getAdaptiveAction(selectedMastery) : null;
  const questionType: QuestionType = questionMode === "questions" ? (adaptiveAction?.questionType ?? "recall") : "recall";

  const adaptivePrompt = selected && adaptiveAction
    ? adaptiveAction.questionType === "why"
      ? `Why does ${selected.title} work? Explain the mechanism or reasoning, not just the definition.`
      : adaptiveAction.questionType === "how"
        ? `How would you use or derive ${selected.title}? Give the sequence of steps and explain why each matters.`
        : adaptiveAction.questionType === "application"
          ? `Apply ${selected.title} to a new problem or real-world situation. What would you do and why?`
          : adaptiveAction.questionType === "teach"
            ? `Teach ${selected.title} to a beginner in 60 seconds. Use a simple explanation, one analogy, and one example.`
            : adaptiveAction.questionType === "reverse"
              ? `Transfer test: given a new situation, how would ${selected.title} help you reason about it? Reconstruct the connection from first principles.`
              : selected.prompt
    : selected?.prompt ?? "";

  const rate = (rating: Rating) => {
    if (!selected || !revealed) return;

    // One honest rating is enough: don't ask learners to classify the same attempt twice.
    const outcome: "correct" | "partial" | "incorrect" =
      rating === "again" ? "incorrect" : rating === "hard" ? "partial" : "correct";
    const confidenceScore = rating === "again" ? 30 : rating === "hard" ? 55 : rating === "good" ? 80 : 95;
    const previous = reviewState[selected.id];
    const previousLevel = previous?.level ?? 0;
    const timestamp = now;
    const interval = rating === "again"
      ? INTERVALS_MS[0]
      : chooseNextInterval(outcome, confidenceScore, previousLevel);
    const level = rating === "again"
      ? 0
      : rating === "hard"
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
      confidence: confidenceScore,
      at: timestamp,
    });
    recordMasteryLevel(selected.id, level);
    setRecall("");
    setRevealed(false);
    setSessionReviewedIds((previousIds) => [...previousIds, selected.id]);
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
  const nextAction = selected ? getAdaptiveAction(mastery[selected.id]) : null;
  const selectedRetention = selected ? retentionEstimate(mastery[selected.id], now) : 0;
  const selectedCalibrationGap = selected ? calibrationGap(mastery[selected.id]) : 0;
  const selectedEvidence = selected ? averageEvidence(mastery[selected.id]) : 0;

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
              className={questionMode === "recall" ? "active" : ""}
              onClick={() => { setQuestionMode("recall"); setRecall(""); setRevealed(false); }}
              role="tab"
              aria-selected={questionMode === "recall"}
            >
              Active recall
            </button>
            <button
              type="button"
              className={questionMode === "questions" ? "active" : ""}
              onClick={() => { setQuestionMode("questions"); setRecall(""); setRevealed(false); }}
              role="tab"
              aria-selected={questionMode === "questions"}
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

      <section className="review-selection" aria-label="Choose review topics">
        <div className="review-selection-heading">
          <div>
            <span className="review-selection-kicker"><SlidersHorizontal size={14} /> SESSION SETUP</span>
            <h2>What do you want to review?</h2>
            <p>Choose a subject and focus. Your existing review history and spacing schedule stay intact.</p>
          </div>
          <span className="review-selection-count"><BookOpen size={15} /> {availableConcepts.length} in this session</span>
        </div>
        <div className="review-selection-controls">
          <label><span>Review mode</span>
            <select value={reviewMode} onChange={(event) => { setReviewMode(event.target.value as "custom" | "due" | "smart"); setSelectedId(null); setRecall(""); setRevealed(false); setSessionReviewedIds([]); }}>
              <option value="custom">My topics</option><option value="due">Due for review</option><option value="smart">Smart review</option>
            </select>
          </label>
          <label><span>Subject</span>
            <select value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); setSelectedId(null); setRecall(""); setRevealed(false); setSessionReviewedIds([]); }}>
              <option value="all">All subjects</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.name}>{subject.name}</option>)}
            </select>
          </label>
          <label><span>Concepts</span>
            <select value={conceptFilter} onChange={(event) => { setConceptFilter(event.target.value as "weak" | "all" | "new"); setSelectedId(null); setRecall(""); setRevealed(false); setSessionReviewedIds([]); }}>
              <option value="weak">Weak / missed</option><option value="all">All concepts</option><option value="new">Not reviewed yet</option>
            </select>
          </label>
          <label><span>Session size</span>
            <select value={sessionSize} onChange={(event) => { setSessionSize(event.target.value); setSelectedId(null); setRecall(""); setRevealed(false); setSessionReviewedIds([]); }}>
              <option value="5">5 concepts</option><option value="10">10 concepts</option><option value="20">20 concepts</option><option value="all">All matching</option>
            </select>
          </label>
        </div>
        {availableConcepts.length === 0 && <p className="review-selection-empty">No concepts match these filters. Try “All concepts” or choose another subject.</p>}
      </section>

      <div className="review-v2-layout">
        <section className="review-v2-main">
          {!selected ? (
            <div className="review-v2-empty">
              <div className="review-v2-empty-icon"><CheckCircle2 size={26} /></div>
              <h2>{concepts.length ? "No concepts in this session" : "Your review system is ready"}</h2>
              <p>
                {concepts.length
                  ? "No concepts match the current selection. Try “All concepts” or choose another subject in Session Setup above."
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
                  Session {availableConcepts.findIndex((concept) => concept.id === selected.id) + 1} of {availableConcepts.length} · {selected.index}/{selected.totalInNote} in note
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
                  {mastery[selected.id] && <span>Retention {Math.round(selectedRetention * 100)}%</span>}
                  {mastery[selected.id] && selectedCalibrationGap >= 15 && <span>Calibration gap {selectedCalibrationGap}%</span>}
                  {mastery[selected.id] && selectedEvidence > 0 && <span>Evidence {selectedEvidence}%</span>}
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
                    {questionMode === "questions" ? adaptivePrompt : selected.prompt}
                  </strong>
                  <p>
                    {questionMode === "questions"
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
                  <button type="button" disabled={!revealed} onClick={() => rate("again")}>
                    <span>Again</span><small>10 min</small>
                  </button>
                  <button type="button" disabled={!revealed} onClick={() => rate("hard")}>
                    <span>Hard</span><small>{formatInterval(Math.max(INTERVALS_MS[0], 24 * 60 * 60 * 1000 * Math.max(1, currentState?.level ?? 0)))}</small>
                  </button>
                  <button type="button" className="good" disabled={!revealed} onClick={() => rate("good")}>
                    <span>Good</span><small>next interval</small>
                  </button>
                  <button type="button" disabled={!revealed} onClick={() => rate("easy")}>
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
