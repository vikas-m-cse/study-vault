import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, CircleHelp, RotateCcw, Trash2 } from "lucide-react";
import "./focus-review-queue.css";

type ReviewItem = {
  id: string;
  subject: string;
  topic: string;
  prompt: string;
  answer: string;
  nextReviewAt: number;
  intervalDays: number;
  attempts: number;
  status: "due" | "mastered";
  createdAt: number;
};
const KEY = "studyvault-focus-review-queue-v1";
const DAY = 24 * 60 * 60 * 1000;
function readItems(): ReviewItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as ReviewItem[] : [];
  } catch { return []; }
}
function dateLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  subject: string;
  topic: string;
  recallNotes: string;
  selfTest: string;
  reviewWhen: string;
};

export default function FocusReviewQueue({ subject, topic, recallNotes, selfTest, reviewWhen }: Props) {
  const [items, setItems] = useState<ReviewItem[]>(readItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* Keep the queue usable for this visit. */ }
  }, [items]);

  const dueItems = useMemo(() => items.filter(item => item.status === "due" && item.nextReviewAt <= Date.now()).sort((a,b) => a.nextReviewAt - b.nextReviewAt), [items]);
  const active = dueItems.find(item => item.id === activeId) ?? dueItems[0] ?? null;

  const saveForReview = () => {
    const cleanTopic = topic.trim();
    if (!cleanTopic) { setFeedback("Add a topic in Session Intention first."); return; }
    const prompt = selfTest.trim() || recallNotes.trim();
    if (!prompt) { setFeedback("Write a self-test question or a memory prompt in the learning loop first."); return; }
    const days = reviewWhen === "tonight" ? 0 : reviewWhen === "3days" ? 3 : reviewWhen === "7days" ? 7 : 1;
    const item: ReviewItem = {
      id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
      subject: subject || "Unassigned",
      topic: cleanTopic,
      prompt,
      answer: recallNotes.trim(),
      nextReviewAt: Date.now() + days * DAY,
      intervalDays: days,
      attempts: 0,
      status: "due",
      createdAt: Date.now()
    };
    setItems(previous => [item, ...previous].slice(0, 250));
    setActiveId(item.id);
    setRevealed(false);
    setFeedback("Saved to your local review queue.");
  };

  const grade = (remembered: boolean) => {
    if (!active) return;
    setItems(previous => previous.map(item => {
      if (item.id !== active.id) return item;
      const nextInterval = remembered ? Math.max(2, item.intervalDays === 0 ? 1 : Math.round(item.intervalDays * 2)) : 1;
      return { ...item, attempts: item.attempts + 1, intervalDays: nextInterval, nextReviewAt: Date.now() + nextInterval * DAY, status: remembered ? "mastered" : "due" };
    }));
    setActiveId(null);
    setRevealed(false);
    setFeedback(remembered ? "Nice. Scheduled for a longer interval." : "No problem. Try this topic again tomorrow.");
  };

  return <section className="focus-review-queue" aria-labelledby="focus-review-queue-title">
    <div className="frq-heading"><div><span className="focus-overline"><CalendarClock size={13} /> SPACED REVIEW</span><h2 id="focus-review-queue-title">Remember it later.</h2><p>Turn today’s weak spots into short future recall sessions.</p></div><span className="frq-count">{dueItems.length} due</span></div>
    <div className="frq-save-row"><p>Save this session’s topic and self-test prompt for a future review. Your queue stays on this device.</p><button type="button" onClick={saveForReview}><CalendarClock size={15} /> Add current topic</button></div>
    {feedback && <p className="frq-feedback" role="status">{feedback}</p>}
    {active ? <div className="frq-review-card">
      <div className="frq-review-meta"><span>{active.subject}</span><span>Review {active.attempts + 1}</span></div>
      <h3>{active.topic}</h3>
      <p className="frq-prompt">{active.prompt}</p>
      {revealed ? <div className="frq-answer"><strong>Your saved recall</strong><p>{active.answer || "No recall notes were saved. Check your source material, then answer again from memory."}</p></div> : <button type="button" className="frq-reveal" onClick={() => setRevealed(true)}><CircleHelp size={15} /> Reveal saved recall</button>}
      {revealed && <div className="frq-grade"><button type="button" onClick={() => grade(false)}><RotateCcw size={14} /> Need more practice</button><button type="button" onClick={() => grade(true)}><Check size={14} /> Recalled it</button></div>}
    </div> : <div className="frq-empty"><Check size={18} /><div><strong>You’re caught up.</strong><p>Add a topic after studying; it will appear here when its review is due.</p></div></div>}
    {items.length > 0 && <details className="frq-upcoming"><summary>Upcoming reviews and saved topics ({items.length})</summary><div className="frq-list">{items.slice(0, 8).map(item => <div className="frq-list-item" key={item.id}><div><strong>{item.topic}</strong><small>{item.subject} · {item.status === "mastered" ? "Recalled" : item.nextReviewAt <= Date.now() ? "Due now" : "Due " + dateLabel(item.nextReviewAt)}</small></div><button type="button" aria-label={"Delete review for " + item.topic} onClick={() => setItems(previous => previous.filter(entry => entry.id !== item.id))}><Trash2 size={14} /></button></div>)}</div></details>}
  </section>;
}
