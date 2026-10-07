import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BrainCircuit,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  FileText,
  Gauge,
  GraduationCap,
  Lightbulb,
  ListChecks,
  LockKeyhole,
  Orbit,
  RotateCcw,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import type { Note } from "../types/note";

type StudyTool = "flashcards" | "questions" | "mnemonics" | "revision" | "teach";
type Flashcard = { question: string; answer: string; source: string };
type StudyQuestion = { type: string; level: string; question: string; hint: string };

type StudyToolsModalProps = {
  note: Note;
  onClose: () => void;
};

const STOP_WORDS = new Set([
  "about","after","again","also","because","before","being","between","could","from","have","into",
  "more","most","other","over","same","some","such","than","that","their","there","these","they",
  "this","through","using","what","when","where","which","while","with","would","your","then","them",
  "were","will","been","each","only","very","does","must","should","where","whose","those","used",
  "system","user","mode","note","topic","main","role","play","thing","following","following",
]);

function sections(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(s => s.length >= 45);
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 45);
}

function keywords(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, char => char.toUpperCase());
}

function cleanSnippet(value: string, max = 180): string {
  return value
    .replace(/^#+\s*/, "")
    .replace(/^\d+(?:\.\d+)*[.)]?\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
}

function conceptName(block: string): string {
  const cleaned = cleanSnippet(block, 100);
  const definition = cleaned.match(/^(.{2,90}?)(?:\s+is|\s+are|\s+means|\s+refers to|\s+is defined as)\b/i);
  if (definition) return definition[1].trim();

  const firstClause = cleaned.split(/[:—–,-]/)[0]?.trim();
  if (firstClause && firstClause.length >= 4 && firstClause.length <= 70) return firstClause;

  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  return words || "Core idea";
}

function makeFlashcards(note: Note): Flashcard[] {
  const blocks = sections(note.plainText);
  const sourceSentences = sentences(note.plainText);
  const candidates = [...blocks, ...sourceSentences];
  const seen = new Set<string>();
  const cards: Flashcard[] = [];

  for (const raw of candidates) {
    const answer = cleanSnippet(raw, 230);
    if (answer.length < 45) continue;

    const concept = conceptName(raw);
    const key = concept.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const definition = answer.match(/^(.{2,90}?)(?:\s+is|\s+are|\s+means|\s+refers to|\s+is defined as)\s+(.{15,})$/i);

    cards.push({
      question: definition
        ? `What is ${concept}?`
        : `What do you remember about ${concept}?`,
      answer,
      source: definition ? "Definition" : "Core idea",
    });

    if (cards.length === 6) break;
  }

  if (!cards.length) {
    return [{
      question: "What is the most important idea in this note?",
      answer: note.plainText.trim().slice(0, 230),
      source: "Source",
    }];
  }

  return cards;
}

function makeQuestions(note: Note): StudyQuestion[] {
  const keys = keywords(note.plainText, 6).map(titleCase);
  const anchor = keys[0] ?? "the central concept";
  const second = keys[1] ?? "a related concept";

  return [
    { type: "RECALL", level: "Remember", question: `Without looking, what are the 3–5 most important ideas in “${note.title || "this note"}”?`, hint: "Reconstruct first. Open the source only after your attempt." },
    { type: "WHY", level: "Understand", question: `Why does ${anchor} matter? What problem does it solve, and what would fail without it?`, hint: "Purpose → mechanism → consequence." },
    { type: "HOW", level: "Reason", question: `How would you reconstruct the main process or mechanism step by step?`, hint: "Explain the sequence and why each step exists." },
    { type: "COMPARE", level: "Distinguish", question: `What is the most important difference between ${anchor} and ${second}?`, hint: "State the difference, then explain when it matters." },
    { type: "APPLICATION", level: "Apply", question: `You face a new problem involving ${anchor}. How would you use what you learned to solve it?`, hint: "Transfer the principle; do not repeat the example from the note." },
    { type: "TEACH", level: "Teach", question: `Teach the hardest idea here to a beginner in 60 seconds.`, hint: "Definition → why → example → common misconception." },
  ];
}

function makeMnemonic(note: Note): string {
  const keys = keywords(note.plainText, 6);
  if (keys.length < 3) {
    return "Not enough distinct concepts yet. Add more structured content, then generate the memory path again.";
  }
  const initials = keys.map(k => k[0].toUpperCase()).join("");
  const phrase = keys.map(k => titleCase(k)).join(" → ");
  return `Memory path\n\n${phrase}\n\nInitials: ${initials}\n\nBuild your own vivid sentence from the initials, then close the source and reconstruct the entire chain from memory.`;
}

function makeRevision(note: Note): string {
  const lines = sections(note.plainText);
  const keys = keywords(note.plainText, 10);
  const bullets = lines.slice(0, 8).map(line => `• ${line.length > 180 ? line.slice(0, 177) + "…" : line}`);
  return [
    `# ${note.title || "Quick Revision"}`,
    "",
    "## Core ideas",
    ...bullets,
    "",
    "## Key concepts",
    keys.length ? keys.map(k => `• ${titleCase(k)}`).join("\n") : "• Add more structured content to extract key concepts.",
    "",
    "## Final retrieval",
    "Close the source. Reconstruct: definition → relationships → example → application → one common mistake.",
  ].join("\n");
}

export default function StudyToolsModal({ note, onClose }: StudyToolsModalProps) {
  const [tool, setTool] = useState<StudyTool>("flashcards");
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const flashcards = useMemo(() => makeFlashcards(note), [note]);
  const questions = useMemo(() => makeQuestions(note), [note]);
  const mnemonic = useMemo(() => makeMnemonic(note), [note]);
  const revision = useMemo(() => makeRevision(note), [note]);
  const wordCount = note.plainText.trim().split(/\s+/).filter(Boolean).length;
  const conceptCount = keywords(note.plainText, 10).length;

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const copyCurrent = tool === "flashcards"
    ? flashcards.map(c => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n")
    : tool === "questions"
      ? questions.map(q => `[${q.type}] ${q.question}\nHint: ${q.hint}`).join("\n\n")
      : tool === "mnemonics" ? mnemonic : revision;

  const tabs: Array<{ id: StudyTool; label: string; icon: typeof BookOpenCheck; meta: string }> = [
    { id: "flashcards", label: "Flashcards", icon: BookOpenCheck, meta: "Retrieve" },
    { id: "questions", label: "Questions", icon: CircleHelp, meta: "Reason" },
    { id: "mnemonics", label: "Memory paths", icon: Lightbulb, meta: "Encode" },
    { id: "revision", label: "Revision", icon: ListChecks, meta: "Compress" },
    { id: "teach", label: "Teach-back", icon: GraduationCap, meta: "Transfer" },
  ];

  return (
    <div className="study-tools-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="study-tools-modal" role="dialog" aria-modal="true" aria-label="StudyVault learning studio" onMouseDown={e => e.stopPropagation()}>
        <div className="study-tools-noise" aria-hidden="true" />

        <header className="study-tools-header">
          <div className="study-tools-brand">
            <div className="study-tools-orbit"><Orbit size={19} /></div>
            <div>
              <p className="study-tools-eyebrow"><span className="status-dot" /> STUDYVAULT · LEARNING OS</p>
              <h2>Transform knowledge into capability.</h2>
              <p className="study-tools-subtitle">{note.title || "Untitled note"} <span>·</span> {wordCount.toLocaleString()} words</p>
            </div>
          </div>

          <div className="study-tools-header-actions">
            <div className="study-tools-source-lock"><LockKeyhole size={13} /> SOURCE LOCKED</div>
            <button type="button" className="study-tools-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </header>

        <div className="study-tools-layout">
          <aside className="study-tools-nav">
            <div className="study-tools-nav-heading">LEARNING MODES</div>
            {tabs.map(({ id, label, icon: Icon, meta }) => (
              <button key={id} className={tool === id ? "active" : ""} onClick={() => setTool(id)}>
                <span className="study-tools-nav-icon"><Icon size={16} /></span>
                <span className="study-tools-nav-copy"><strong>{label}</strong><small>{meta}</small></span>
                {tool === id && <ChevronRight size={14} className="study-tools-nav-arrow" />}
              </button>
            ))}

            <div className="study-tools-nav-bottom">
              <div className="study-tools-mini-card">
                <Gauge size={15} />
                <div><strong>Learning signal</strong><span>Source grounded</span></div>
              </div>
              <div className="study-tools-local"><Zap size={12} /> Runs locally · no source drift</div>
            </div>
          </aside>

          <main className="study-tools-content">
            <div className="study-tools-command-bar">
              <div>
                <span className="study-tools-label">{tool.toUpperCase()}</span>
                <h3>
                  {tool === "flashcards" && "Retrieve before you reread."}
                  {tool === "questions" && "Make the brain do the work."}
                  {tool === "mnemonics" && "Build a memory structure that sticks."}
                  {tool === "revision" && "Compress the source into a final pass."}
                  {tool === "teach" && "Prove you can reconstruct the idea."}
                </h3>
              </div>
              <button type="button" className="study-tools-copy" onClick={() => copyText(copyCurrent)}>
                <Copy size={13} /> {copied ? "Copied" : "Export"}
              </button>
            </div>

            <div className="study-tools-signal-row">
              <div><FileText size={14} /><span><b>{wordCount.toLocaleString()}</b> source words</span></div>
              <div><Target size={14} /><span><b>{conceptCount}</b> concept signals</span></div>
              <div><BrainCircuit size={14} /><span><b>5</b> cognitive modes</span></div>
              <div className="study-tools-signal-live"><span className="status-dot" /> LOCAL ENGINE</div>
            </div>

            {tool === "flashcards" && (
              <>
                <div className="study-tools-learning-directive">
                  <div className="study-tools-directive-icon"><BrainCircuit size={17} /></div>
                  <div>
                    <strong>Don’t read. Reconstruct.</strong>
                    <p>Try to answer each prompt in your head first. Reveal the source only when you get stuck or want to verify.</p>
                  </div>
                  <span>{flashcards.length} high-signal prompts</span>
                </div>
                <div className="study-tools-card-list">
                  {flashcards.map((card, i) => (
                    <article className={`study-tools-card ${revealed[i] ? "revealed" : ""}`} key={i}>
                      <div className="study-tools-card-top">
                        <span className="study-tools-index">{String(i + 1).padStart(2, "0")} / {String(flashcards.length).padStart(2, "0")}</span>
                        <span className="study-tools-card-source">{card.source}</span>
                      </div>
                      <strong>{card.question}</strong>
                      {revealed[i] ? (
                        <div className="study-tools-answer">
                          <span>VERIFY AGAINST SOURCE</span>
                          <p>{card.answer}</p>
                        </div>
                      ) : (
                        <button type="button" className="study-tools-reveal" onClick={() => setRevealed(prev => ({ ...prev, [i]: true }))}>
                          <RotateCcw size={13} /> Check my memory <ArrowUpRight size={12} />
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}

            {tool === "questions" && (
              <div className="study-tools-question-list">
                {questions.map((q, i) => (
                  <article key={i}>
                    <div className="study-tools-question-meta"><span>{q.type}</span><small>{q.level}</small></div>
                    <strong>{q.question}</strong>
                    <div className="study-tools-hint"><Sparkles size={12} /> {q.hint}</div>
                  </article>
                ))}
              </div>
            )}

            {tool === "mnemonics" && (
              <article className="study-tools-feature study-tools-memory-feature">
                <div className="study-tools-feature-icon"><Lightbulb size={20} /></div>
                <div>
                  <span className="study-tools-feature-label">MEMORY ARCHITECTURE</span>
                  <h4>Turn isolated facts into a connected path.</h4>
                  <pre>{mnemonic}</pre>
                  <p>Make the final mnemonic personal, then close the source and reconstruct the chain without looking.</p>
                </div>
              </article>
            )}

            {tool === "revision" && (
              <article className="study-tools-feature">
                <div className="study-tools-feature-icon"><ListChecks size={20} /></div>
                <div>
                  <span className="study-tools-feature-label">COMPRESSION LAYER</span>
                  <h4>Your last-pass learning map.</h4>
                  <pre>{revision}</pre>
                </div>
              </article>
            )}

            {tool === "teach" && (
              <article className="study-tools-feature study-tools-teach-feature">
                <div className="study-tools-feature-icon"><GraduationCap size={20} /></div>
                <div>
                  <span className="study-tools-feature-label">TRANSFER TEST</span>
                  <h4>60-second teach-back</h4>
                  <p className="study-tools-large-copy">Close your note. Explain the topic as if a beginner is sitting in front of you.</p>
                  <div className="study-tools-teach-steps">
                    {["Define the core idea.", "Explain why it exists.", "Show how it works.", "Give one concrete example.", "Name one common confusion."].map((step, i) => (
                      <div key={step}><span>{i + 1}</span><p>{step}</p><Check size={13} /></div>
                    ))}
                  </div>
                  <div className="study-tools-callout"><Sparkles size={13} /> The goal is not perfect wording. The goal is discovering what you cannot reconstruct yet.</div>
                </div>
              </article>
            )}
          </main>
        </div>

        <footer className="study-tools-footer">
          <div className="study-tools-footer-status"><span className="status-dot" /> Learning loop active <span>·</span> grounded in your source</div>
          <button type="button" className="study-tools-done" onClick={onClose}>Return to workspace <ArrowUpRight size={14} /></button>
        </footer>
      </section>
    </div>
  );
}
