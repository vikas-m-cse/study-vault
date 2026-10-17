import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Brain, CalendarClock, CheckCircle2, Clock3, Sparkles, Target } from "lucide-react";
import { getAllNotes } from "./services/noteStorage";
import type { Note } from "./types/note";
import type { Subject } from "./Subjects";
import { getMastery, type ConceptMastery } from "./services/learningCore";

type Props = {
  subjects: Subject[];
  onOpenReview: () => void;
  onStartFocus: (subject: string, topic: string) => void;
};

type ReviewEntry = { nextReviewAt?: number; lastReviewedAt?: number; attempts?: number; level?: number };
type Recommendation = { note: Note; subjectName: string; dueCount: number; mastery: number; reason: string; score: number };

const REVIEW_KEY = "studyvault-review-v2";

function readReviewState(): Record<string, ReviewEntry> {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    return raw ? JSON.parse(raw) as Record<string, ReviewEntry> : {};
  } catch {
    return {};
  }
}

function noteRecommendation(note: Note, subjectName: string, review: Record<string, ReviewEntry>, masteryMap: Record<string, ConceptMastery>, now: number): Recommendation {
  const reviewEntries = Object.entries(review).filter(([id]) => id.startsWith(note.id + "::"));
  const dueCount = reviewEntries.filter(([, entry]) => typeof entry.nextReviewAt === "number" && entry.nextReviewAt <= now).length;
  const masteryEntries = Object.entries(masteryMap).filter(([id]) => id.startsWith(note.id + "::")).map(([, value]) => value);
  const mastery = masteryEntries.length
    ? Math.round(masteryEntries.reduce((sum, value) => sum + (value.attempts ? (value.correct + value.partial * 0.6) / value.attempts * 100 : 0), 0) / masteryEntries.length)
    : 0;
  const neverReviewed = reviewEntries.length === 0 && masteryEntries.length === 0;
  const updated = new Date(note.updatedAt).getTime() || 0;
  const ageDays = Math.max(0, (now - updated) / 86_400_000);
  const weak = masteryEntries.length > 0 && mastery < 65;
  const score = dueCount * 100 + (weak ? 35 : 0) + (neverReviewed ? 18 : 0) + Math.min(ageDays, 30) * 0.25;
  const reason = dueCount > 0
    ? `${dueCount} concept${dueCount === 1 ? "" : "s"} due for revision`
    : weak
      ? `Build confidence · current evidence ${mastery}%`
      : neverReviewed
        ? "A fresh note to turn into lasting knowledge"
        : "Revisit this note to strengthen retention";
  return { note, subjectName, dueCount, mastery, reason, score };
}

export default function TodayPlan({ subjects, onOpenReview, onStartFocus }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [review] = useState(readReviewState);
  const [mastery] = useState(getMastery);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    getAllNotes().then((items) => {
      if (!cancelled) setNotes(items.filter((note) => note.status === "active"));
    }).catch((error) => {
      console.error("[StudyVault] Could not build today's plan:", error);
      if (!cancelled) setNotes([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    const update = () => setRefresh((value) => value + 1);
    window.addEventListener("studyvault:learning-updated", update);
    window.addEventListener("studyvault:review-updated", update);
    window.addEventListener("storage", update);
    return () => {
      cancelled = true;
      window.removeEventListener("studyvault:learning-updated", update);
      window.removeEventListener("studyvault:review-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const recommendations = useMemo(() => {
    const reviewState = refresh ? readReviewState() : review;
    const masteryState = refresh ? getMastery() : mastery;
    return notes.map((note) => {
      const subjectName = subjects.find((subject) => subject.id === note.subjectId)?.name ?? "Unassigned subject";
      return noteRecommendation(note, subjectName, reviewState, masteryState, now);
    }).sort((a, b) => b.score - a.score || new Date(b.note.updatedAt).getTime() - new Date(a.note.updatedAt).getTime());
  }, [notes, subjects, review, mastery, now, refresh]);

  const recommendation = recommendations[0];
  const dueTotal = recommendations.reduce((sum, item) => sum + item.dueCount, 0);
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <section className="sv-today-plan" aria-labelledby="sv-today-plan-title">
      <div className="sv-today-plan-top">
        <div>
          <span className="sv-today-kicker"><Sparkles size={13} /> YOUR NEXT BEST MOVE</span>
          <h2 id="sv-today-plan-title">What should I study <em>today?</em></h2>
          <p>{today} · A recommendation based on your notes and revision history.</p>
        </div>
        <span className="sv-today-orbit" aria-hidden="true"><Target size={25} /></span>
      </div>
      {loading ? (
        <div className="sv-today-empty"><span className="sv-plan-skeleton" /><span className="sv-plan-skeleton short" /><span className="sv-plan-skeleton button" /></div>
      ) : recommendation ? (
        <div className="sv-today-recommendation">
          <div className="sv-today-note-icon"><BookOpen size={20} /></div>
          <div className="sv-today-note-copy">
            <span className="sv-today-label">RECOMMENDED SESSION</span>
            <h3>{recommendation.note.title}</h3>
            <p>{recommendation.subjectName} <span>·</span> {recommendation.reason}</p>
            <div className="sv-today-metrics">
              <span><Clock3 size={13} /> 25-minute focus</span>
              {recommendation.dueCount > 0 && <span><CalendarClock size={13} /> {recommendation.dueCount} due</span>}
              {recommendation.mastery > 0 && <span><Brain size={13} /> {recommendation.mastery}% evidence</span>}
            </div>
          </div>
          <div className="sv-today-actions">
            <button type="button" className="sv-today-primary" onClick={() => onStartFocus(recommendation.subjectName, recommendation.note.title)}>Start this session <ArrowRight size={15} /></button>
            <button type="button" className="sv-today-secondary" onClick={onOpenReview}>Open revision</button>
          </div>
        </div>
      ) : (
        <div className="sv-today-empty">
          <span className="sv-today-empty-icon"><BookOpen size={20} /></span>
          <div><strong>Your next study session starts with one note.</strong><p>Add or create a note, then StudyVault can recommend a concrete session here.</p></div>
        </div>
      )}
      <div className="sv-today-footer">
        <span><CheckCircle2 size={14} /> Plan → Focus → Recall → Review</span>
        <button type="button" onClick={onOpenReview}>{dueTotal > 0 ? `Review ${dueTotal} due concept${dueTotal === 1 ? "" : "s"}` : "Open revision queue"} <ArrowRight size={13} /></button>
      </div>
    </section>
  );
}
