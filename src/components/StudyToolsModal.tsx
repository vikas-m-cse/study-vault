import { useMemo, useState } from "react";
import {
  BrainCircuit,
  BookOpenCheck,
  Copy,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Sparkles,
  X,
} from "lucide-react";
import type { Note } from "../types/note";

type StudyTool = "flashcards" | "mnemonics" | "questions" | "revision" | "teach";

type Flashcard = { question: string; answer: string };
type StudyQuestion = { type: string; question: string; hint: string };

type StudyToolsModalProps = {
  note: Note;
  onClose: () => void;
};

const STOP_WORDS = new Set([
  "about","after","again","also","because","before","being","between","could","from","have","into",
  "more","most","other","over","same","some","such","than","that","their","there","these","they",
  "this","through","using","what","when","where","which","while","with","would","your","then","them",
  "were","will","been","each","only","very","does","must","should","where","whose","those","used",
]);

function sentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 35);
}

function sections(text: string): string[] {
  return text.split(/\n{2,}/).map(s => s.replace(/\s+/g, " ").trim()).filter(s => s.length >= 45);
}

function keywords(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
}

function makeFlashcards(note: Note): Flashcard[] {
  const lines = sections(note.plainText);
  const cards: Flashcard[] = [];

  for (const line of lines.slice(0, 12)) {
    const definition = line.match(/^(.{2,80}?)(?:\s+is|\s+are|\s+means|\s+refers to)\s+(.{15,})$/i);
    if (definition) {
      cards.push({
        question: `What is ${definition[1].trim()}?`,
        answer: definition[2].trim(),
      });
    } else {
      const words = line.split(/\s+/);
      const subject = words.slice(0, Math.min(7, words.length)).join(" ");
      cards.push({
        question: `What is the key idea behind: “${subject}…”?`,
        answer: line,
      });
    }
  }

  const keys = keywords(note.plainText, 5);
  keys.forEach((key) => cards.push({
    question: `What role does “${key}” play in ${note.title || "this topic"}?`,
    answer: `Explain how ${key} connects to the main ideas in your own words, using the source as your reference.`,
  }));

  return cards.slice(0, 15);
}

function makeQuestions(note: Note): StudyQuestion[] {
  const keys = keywords(note.plainText, 6);
  const result: StudyQuestion[] = [
    { type: "RECALL", question: `Without looking, what are the 3–5 most important ideas in “${note.title || "this note"}”?`, hint: "Start from memory. Do not reopen the note yet." },
    { type: "WHY", question: `Why does ${keys[0] ?? "the central concept"} matter? What problem does it solve?`, hint: "Connect purpose → mechanism → consequence." },
    { type: "HOW", question: `How would you explain the main process or mechanism in this note step by step?`, hint: "Reconstruct the sequence rather than copying sentences." },
    { type: "COMPARE", question: `What is one important distinction between two related ideas in this note?`, hint: "Look for concepts that could easily be confused." },
    { type: "APPLICATION", question: `Imagine a new real-world or exam scenario involving ${keys[1] ?? "this topic"}. How would you use what you learned?`, hint: "Transfer the idea to a situation you have not seen verbatim." },
    { type: "TEACH", question: `Teach the most important concept here to a beginner in 60 seconds. What must they understand?`, hint: "Definition → why → example → common mistake." },
  ];
  return result;
}

function makeMnemonic(note: Note): string {
  const keys = keywords(note.plainText, 6);
  if (keys.length < 3) return "Not enough distinct concepts yet. Add a little more structured content, then generate a mnemonic again.";
  const initials = keys.map(k => k[0].toUpperCase()).join("");
  const phrase = keys.map(k => k[0].toUpperCase() + k.slice(1)).join(" → ");
  return `Memory chain: ${phrase}\n\nInitials: ${initials}\n\nTry building your own vivid sentence using these initials. Then close the note and reconstruct the chain from memory. Personal mnemonics are usually more useful when they are meaningful to you.`;
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
    "## Key terms",
    keys.length ? keys.map(k => `• ${k}`).join("\n") : "• Add more structured content to extract key terms.",
    "",
    "## Final retrieval",
    "Close the source and explain the topic from memory: definition → key ideas → relationships → example → application.",
  ].join("\n");
}

export default function StudyToolsModal({ note, onClose }: StudyToolsModalProps) {
  const [tool, setTool] = useState<StudyTool>("flashcards");
  const [copied, setCopied] = useState(false);

  const flashcards = useMemo(() => makeFlashcards(note), [note]);
  const questions = useMemo(() => makeQuestions(note), [note]);
  const mnemonic = useMemo(() => makeMnemonic(note), [note]);
  const revision = useMemo(() => makeRevision(note), [note]);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="study-tools-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="study-tools-modal" role="dialog" aria-modal="true" aria-label="Study tools" onMouseDown={e => e.stopPropagation()}>
        <header className="study-tools-header">
          <div>
            <p className="eyebrow">LEARNING TRANSFORMATION STUDIO</p>
            <h2>Turn this note into learning</h2>
            <p>{note.title || "Untitled note"} · {note.plainText.trim().split(/\s+/).filter(Boolean).length} words</p>
          </div>
          <button type="button" className="study-tools-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="study-tools-layout">
          <nav className="study-tools-nav" aria-label="Study transformations">
            <button className={tool === "flashcards" ? "active" : ""} onClick={() => setTool("flashcards")}><BookOpenCheck size={17} /><span>Flashcards</span></button>
            <button className={tool === "questions" ? "active" : ""} onClick={() => setTool("questions")}><HelpCircle size={17} /><span>Questions</span></button>
            <button className={tool === "mnemonics" ? "active" : ""} onClick={() => setTool("mnemonics")}><Lightbulb size={17} /><span>Mnemonics</span></button>
            <button className={tool === "revision" ? "active" : ""} onClick={() => setTool("revision")}><ListChecks size={17} /><span>Quick revision</span></button>
            <button className={tool === "teach" ? "active" : ""} onClick={() => setTool("teach")}><BrainCircuit size={17} /><span>Teach-back</span></button>
          </nav>

          <main className="study-tools-content">
            <div className="study-tools-title-row">
              <div>
                <span className="study-tools-label">{tool.toUpperCase()}</span>
                <h3>
                  {tool === "flashcards" && "Retrieve before you reread"}
                  {tool === "questions" && "Challenge your understanding"}
                  {tool === "mnemonics" && "Create memory hooks"}
                  {tool === "revision" && "Compress the note into a final pass"}
                  {tool === "teach" && "Prove that you can explain it"}
                </h3>
              </div>
              <button type="button" className="study-tools-copy" onClick={() => copyText(
                tool === "flashcards" ? flashcards.map(c => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n") :
                tool === "questions" ? questions.map(q => `[${q.type}] ${q.question}\nHint: ${q.hint}`).join("\n\n") :
                tool === "mnemonics" ? mnemonic : revision
              )}><Copy size={14} />{copied ? "Copied" : "Copy"}</button>
            </div>

            {tool === "flashcards" && (
              <div className="study-tools-card-list">
                {flashcards.map((card, i) => <article className="study-tools-card" key={i}><span>Card {i + 1}</span><strong>{card.question}</strong><p>{card.answer}</p></article>)}
              </div>
            )}

            {tool === "questions" && (
              <div className="study-tools-question-list">
                {questions.map((q, i) => <article key={i}><span>{q.type}</span><strong>{q.question}</strong><p>Hint: {q.hint}</p></article>)}
              </div>
            )}

            {tool === "mnemonics" && <article className="study-tools-feature"><Sparkles size={22} /><pre>{mnemonic}</pre><p>Best practice: personalize the final mnemonic, then retrieve the underlying concepts without looking.</p></article>}

            {tool === "revision" && <article className="study-tools-feature"><ListChecks size={22} /><pre>{revision}</pre></article>}

            {tool === "teach" && (
              <article className="study-tools-feature">
                <BrainCircuit size={22} />
                <h4>60-second teach-back</h4>
                <p>Close your note. Explain the topic aloud or write it as if teaching a beginner.</p>
                <ol><li>Define the core idea.</li><li>Explain why it exists.</li><li>Show how it works.</li><li>Give one concrete example.</li><li>Name one common confusion or limitation.</li></ol>
                <div className="study-tools-callout">The goal is not to sound perfect. The goal is to discover what you cannot reconstruct yet.</div>
              </article>
            )}
          </main>
        </div>

        <footer className="study-tools-footer">
          <span><Sparkles size={14} /> Generated from this note only. StudyVault keeps the learning loop grounded in your source.</span>
          <button type="button" className="primary-button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}
