import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BrainCircuit,
  BookOpenCheck,
  Check,
  ClipboardCheck,
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
  Send,
  X,
  Zap,
} from "lucide-react";
import type { Note, TipTapNode } from "../types/note";
import { adaptiveNeed, getAdaptiveAction, getMastery, masteryPercent, recordLearningEvent, retentionEstimate, type QuestionType } from "../services/learningCore";

type StudyTool = "mission" | "flashcards" | "questions" | "mnemonics" | "revision" | "teach";

type MissionChallenge = {
  type: "recall" | "why" | "apply" | "teach";
  label: string;
  title: string;
  prompt: string;
  reference: string;
  concept: string;
};
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
  const cleaned = cleanSnippet(block, 180);

  const definition = cleaned.match(
    /^(.{2,80}?)(?:\s+is|\s+are|\s+means|\s+refers to|\s+is defined as)\b/i,
  );
  if (definition) return definition[1].trim();

  const heading = cleaned.match(
    /^(?:\d+(?:\.\d+)*[.)]?\s*)?([A-Z][A-Za-z][A-Za-z\s/&-]{2,55})$/,
  );
  if (heading) return heading[1].trim();

  const explicit = cleaned.match(
    /^(?:what is|introduction to|overview of|basics of)\s+([A-Za-z][A-Za-z\s/&-]{2,55})/i,
  );
  if (explicit) return explicit[1].trim();

  const domainLead = cleaned.match(
    /^(?:computer|operating system|memory|process|storage|file|device|cpu|kernel|thread|deadlock|scheduling|virtual memory|paging|segmentation)\b(?:\s+[A-Za-z][A-Za-z-]{1,20}){0,5}/i,
  );
  if (domainLead) return domainLead[0].trim();

  const firstClause = cleaned.split(/[:—–,]/)[0]?.trim();
  if (firstClause && firstClause.length >= 4 && firstClause.length <= 55) {
    return firstClause;
  }

  return cleaned.split(/\s+/).slice(0, 4).join(" ") || "Core idea";
}

function studyNodeText(node: TipTapNode): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(studyNodeText).join(" ").replace(/\s+/g, " ").trim();
}

function structuredLearningBlocks(note: Note): string[] {
  const nodes = note.content?.content ?? [];
  const hasHeadings = nodes.some(node => node.type === "heading");
  if (!hasHeadings) return [];

  const blocks: string[] = [];
  let heading = "";
  let body: string[] = [];

  const flush = () => {
    if (!body.length) return;
    const combined = heading ? `${heading}: ${body.join(" ")}` : body.join(" ");
    const lower = combined.toLowerCase();
    const metadataHits = (lower.match(/day\s+\d+|course\s*:|subject\s*:|study mode\s*:|semester\s*:|scheme\s*:|vtu\b/g) ?? []).length;
    if (metadataHits < 2 && combined.length >= 55) blocks.push(combined);
    body = [];
  };

  for (const node of nodes) {
    if (node.type === "heading") {
      flush();
      heading = studyNodeText(node);
      continue;
    }

    if (node.type === "paragraph" || node.type === "list_item" || node.type === "blockquote" || node.type === "codeBlock") {
      const text = studyNodeText(node);
      if (text) body.push(text);
    }
  }

  flush();
  return blocks;
}

function missionBlocks(note: Note): string[] {
  const structured = structuredLearningBlocks(note);
  if (structured.length) return structured;

  const raw = note.plainText
    .split(/\n{1,}/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const filtered = raw.filter(line => {
    const lower = line.toLowerCase();
    if (lower === (note.title || "").trim().toLowerCase()) return false;
    if (/^(?:untitled note|day \d+ course|course:|subject:|study mode:|semester:|vtu|scheme:)/i.test(line)) return false;
    const metadataHits = (lower.match(/day\s+\d+|course\s*:|subject\s*:|study mode\s*:|semester\s*:|scheme\s*:|vtu\b/g) ?? []).length;
    if (metadataHits >= 2) return false;
    if (/^\d{1,4}\s+(?:words?|source words?|concept signals?)/i.test(line)) return false;
    return line.length >= 55;
  });

  const joined = filtered.join("\n\n");
  return sections(joined).length ? sections(joined) : sentences(joined);
}

function makeFlashcards(note: Note): Flashcard[] {
  const blocks = missionBlocks(note);
  const candidates = blocks.length ? blocks : sections(note.plainText);
  const seen = new Set<string>();
  const cards: Flashcard[] = [];

  const add = (question: string, answer: string, source: string) => {
    const cleanQuestion = question.replace(/\s+/g, " ").trim();
    const cleanAnswer = cleanSnippet(answer, 210);
    const key = cleanQuestion.toLowerCase();
    if (!cleanAnswer || cleanAnswer.length < 35 || seen.has(key)) return;
    seen.add(key);
    cards.push({ question: cleanQuestion, answer: cleanAnswer, source });
  };

  for (const raw of candidates) {
    const text = cleanSnippet(raw, 360);
    if (text.length < 35) continue;

    const definition = text.match(
      /^(.{2,80}?)(?:\s+is|\s+are|\s+means|\s+refers to|\s+is defined as)\s+(.{20,})$/i,
    );

    if (definition) {
      const concept = definition[1].trim();
      add("What is " + concept + "?", definition[2].trim(), "Definition");
      continue;
    }

    const why = text.match(/^(.{2,80}?)(?:\s+because|\s+so that|\s+in order to)\s+(.{15,})$/i);
    if (why) {
      add("Why does " + why[1].trim() + " work this way?", text, "Mechanism");
      continue;
    }

    const mechanism = text.match(
      /^(.{2,75}?)(?:\s+works by|\s+uses|\s+allows|\s+enables|\s+consists of)\s+(.{15,})$/i,
    );
    if (mechanism) {
      add("How does " + mechanism[1].trim() + " work?", text, "Mechanism");
      continue;
    }

    const concept = conceptName(text);
    add("What is " + concept + ", and what is its role in this topic?", text, "Core idea");
  }

  if (cards.length < 6) {
    const keys = keywords(note.plainText, 8);
    const source = cleanSnippet(note.plainText, 210);
    for (const key of keys) {
      if (cards.length >= 6) break;
      add("What role does " + titleCase(key) + " play in this topic?", source, "Concept");
    }
  }

  return cards.slice(0, 6);
}

function meaningfulWords(value: string): string[] {
  return [...new Set(
    value.toLowerCase()
      .match(/[a-z][a-z-]{4,}/g)
      ?.filter(word => !STOP_WORDS.has(word)) ?? [],
  )];
}

function evaluateAttempt(answer: string, reference: string): number {
  const attempt = new Set(meaningfulWords(answer));
  const expected = meaningfulWords(reference);
  if (!answer.trim() || expected.length === 0) return 0;
  const matched = expected.filter(word => attempt.has(word)).length;
  return Math.min(100, Math.round((matched / Math.min(expected.length, 12)) * 100));
}

function makeMission(note: Note): MissionChallenge[] {
  const source = missionBlocks(note);
  const usable = source.slice(0, 4);
  const challenges: MissionChallenge[] = [];

  usable.forEach((block, index) => {
    const concept = conceptName(block);
    const reference = cleanSnippet(block, 420);
    challenges.push({
      type: "recall",
      label: "RECALL",
      title: `Reconstruct ${concept}`,
      prompt: `Without opening the source, what do you know about ${concept}? Start with the core idea, then add the most important detail.`,
      reference,
      concept,
    });
    if (index === 0) {
      challenges.push({
        type: "why",
        label: "REASON",
        title: `Why does ${concept} matter?`,
        prompt: `What problem does ${concept} solve? Explain why it exists and what would go wrong without it.`,
        reference,
        concept,
      });
    }
  });

  const firstConcept = usable[0] ? conceptName(usable[0]) : "this topic";
  const secondConcept = usable[1] ? conceptName(usable[1]) : firstConcept;
  const combinedReference = usable.slice(0, 2).map(value => cleanSnippet(value, 420)).join(" ");
  challenges.push({
    type: "apply",
    label: "TRANSFER",
    title: `Use ${firstConcept} in a new situation`,
    prompt: `Imagine a new exam or real-world situation involving ${firstConcept}. What would you do, and how would ${secondConcept} affect your reasoning?`,
    reference: combinedReference || note.plainText.slice(0, 420),
    concept: firstConcept,
  });
  challenges.push({
    type: "teach",
    label: "TEACH",
    title: `Teach ${firstConcept} in 60 seconds`,
    prompt: `Explain ${firstConcept} to a beginner. Include the idea, why it matters, one example, and one common confusion.`,
    reference: combinedReference || note.plainText.slice(0, 420),
    concept: firstConcept,
  });

  return challenges.slice(0, 6);
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
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [flashcardRatings, setFlashcardRatings] = useState<Record<number, "known" | "missed">>({});
  const [flashcardInsight, setFlashcardInsight] = useState<{ type: "known" | "missed"; concept: string; label: string; reason: string } | null>(null);
  const [flashcardTransition, setFlashcardTransition] = useState<"idle" | "exiting">("idle");
  const [missionAnswer, setMissionAnswer] = useState("");
  const [missionStep, setMissionStep] = useState(0);
  const [missionSubmitted, setMissionSubmitted] = useState(false);
  const [missionConfidence, setMissionConfidence] = useState(0);

  const flashcards = useMemo(() => makeFlashcards(note), [note]);
  const questions = useMemo(() => makeQuestions(note), [note]);
  const mnemonic = useMemo(() => makeMnemonic(note), [note]);
  const revision = useMemo(() => makeRevision(note), [note]);
  const mission = useMemo(() => makeMission(note), [note]);
  const currentMission = mission[missionStep] ?? mission[0];
  const missionScore = missionSubmitted && currentMission ? evaluateAttempt(missionAnswer, currentMission.reference) : 0;
  const missionDone = missionStep >= mission.length - 1 && missionSubmitted && missionScore >= 40;
  const currentMastery = currentMission ? getMastery()[`${note.id}::${currentMission.concept}`] : undefined;
  const adaptiveMissionAction = getAdaptiveAction(currentMastery);
  const wordCount = note.plainText.trim().split(/\s+/).filter(Boolean).length;
  const conceptCount = keywords(note.plainText, 10).length;
  const knownCount = Object.values(flashcardRatings).filter(value => value === "known").length;
  const missedCount = Object.values(flashcardRatings).filter(value => value === "missed").length;
  const deckComplete = flashcards.length > 0 && knownCount + missedCount === flashcards.length;
  const missedCards = flashcards.map((_, index) => index).filter(index => flashcardRatings[index] === "missed");
  const currentFlashcard = flashcards[flashcardIndex];
  const flashcardConcept = currentFlashcard ? conceptName(currentFlashcard.question.replace(/^What is (?:the core idea behind |the role of |the concept of )/i, "")) : "this concept";
  const flashcardMastery = currentFlashcard ? getMastery()[note.id + "::" + flashcardConcept] : undefined;
  const flashcardNeed = adaptiveNeed(flashcardMastery);
  const flashcardAction = getAdaptiveAction(flashcardMastery);
  const flashcardMasteryPercent = masteryPercent(flashcardMastery);
  const flashcardRetention = retentionEstimate(flashcardMastery);

  useEffect(() => {
    if (tool !== "flashcards") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        if (!deckComplete && flashcardTransition === "idle") setFlashcardFlipped(value => !value);
      }
      if (event.code === "ArrowRight" && !deckComplete && flashcardFlipped && flashcardIndex < flashcards.length - 1 && flashcardTransition === "idle") {
        setFlashcardTransition("exiting");
        window.setTimeout(() => {
          setFlashcardIndex(value => value + 1);
          setFlashcardFlipped(false);
          setFlashcardTransition("idle");
        }, 360);
      }
      if (event.code === "ArrowLeft" && !deckComplete && flashcardIndex > 0) {
        setFlashcardIndex(value => value - 1);
        setFlashcardFlipped(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tool, deckComplete, flashcardFlipped, flashcardIndex, flashcards.length, flashcardTransition]);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const copyCurrent = tool === "mission"
    ? mission.map((m, i) => `${i + 1}. [${m.label}] ${m.title}\n${m.prompt}`).join("\n\n")
    : tool === "flashcards"
    ? flashcards.map(c => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n")
    : tool === "questions"
      ? questions.map(q => `[${q.type}] ${q.question}\nHint: ${q.hint}`).join("\n\n")
      : tool === "mnemonics" ? mnemonic : revision;

  const tabs: Array<{ id: StudyTool; label: string; icon: typeof BookOpenCheck; meta: string }> = [
    { id: "mission", label: "Learning mission", icon: ClipboardCheck, meta: "Adaptive" },
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
                  {tool === "mission" && "One concept. One attempt. One next step."}
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
              <div><BrainCircuit size={14} /><span><b>{mission.length}</b> mission challenges</span></div>
              <div className="study-tools-signal-live"><span className="status-dot" /> LOCAL ENGINE</div>
            </div>

            {tool === "mission" && currentMission && (
              <div className="study-tools-mission">
                <div className="study-tools-mission-hero">
                  <div className="study-tools-mission-top">
                    <div>
                      <span className="study-tools-feature-label">LEARNING MISSION</span>
                      <h4>{missionDone ? "Mission complete. Evidence collected." : currentMission.title}</h4>
                    </div>
                    <div className="study-tools-mission-count">{Math.min(missionStep + 1, mission.length)} / {mission.length}</div>
                  </div>
                  <div className="study-tools-mission-progress">
                    <span style={{ width: `${Math.min(100, ((missionStep + (missionSubmitted ? 1 : 0)) / mission.length) * 100)}%` }} />
                  </div>
                  <div className="study-tools-mission-type">{currentMission.label} · {currentMission.concept}</div>
                </div>

                {!missionSubmitted ? (
                  <>
                    <div className="study-tools-mission-prompt">
                      <span>CHALLENGE</span>
                      <strong>{currentMission.prompt}</strong>
                      <p>Do not open the source. Your first answer is the evidence StudyVault can learn from.</p>
                    </div>

                    <textarea
                      className="study-tools-mission-input"
                      value={missionAnswer}
                      onChange={event => setMissionAnswer(event.target.value)}
                      placeholder="Build the answer from memory…"
                      autoFocus
                    />

                    <div className="study-tools-mission-confidence">
                      <div>
                        <span>CALIBRATION</span>
                        <strong>How confident are you?</strong>
                      </div>
                      <div>
                        {[1,2,3,4,5].map(value => (
                          <button key={value} type="button" className={missionConfidence === value ? "selected" : ""} onClick={() => setMissionConfidence(value)}>{value}</button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="study-tools-mission-submit"
                      disabled={!missionAnswer.trim() || missionConfidence === 0}
                      onClick={() => {
                        setMissionSubmitted(true);
                        if (currentMission) {
                          const questionType: QuestionType =
                            currentMission.type === "why" ? "why"
                              : currentMission.type === "apply" ? "application"
                              : currentMission.type === "teach" ? "teach"
                              : "recall";
                          const outcome = missionScore >= 70 ? "correct" : missionScore >= 40 ? "partial" : "incorrect";
                          recordLearningEvent({
                            conceptId: `${note.id}::${currentMission.concept}`,
                            questionType,
                            outcome,
                            confidence: missionConfidence * 20,
                            evidenceScore: missionScore,
                            at: Date.now(),
                          });
                        }
                      }}
                    >
                      <Send size={14} /> Submit evidence <ArrowUpRight size={13} />
                    </button>
                  </>
                ) : (
                  <div className="study-tools-mission-result">
                    <div className="study-tools-mission-score">
                      <div>
                        <span>LOCAL EVIDENCE SIGNAL</span>
                        <strong>{missionScore}%</strong>
                      </div>
                      <div className="study-tools-mission-verdict">
                        {missionScore >= 70 ? "Strong reconstruction" : missionScore >= 40 ? "Partial reconstruction" : "Rebuild needed"}
                      </div>
                    </div>
                    <div className="study-tools-mission-feedback">
                      <div>
                        <span>YOUR ATTEMPT</span>
                        <p>{missionAnswer}</p>
                      </div>
                      <div>
                        <span>SOURCE REFERENCE</span>
                        <p>{currentMission.reference}</p>
                      </div>
                    </div>
                    <div className="study-tools-mission-next">
                      <div className="study-tools-directive-icon"><Sparkles size={16} /></div>
                      <div>
                        <span>NEXT BEST ACTION</span>
                        <strong>{missionDone ? "Return later for spaced retrieval." : missionScore < 40 ? "Rebuild the concept, then try again." : adaptiveMissionAction.label}</strong>
                        <p>Confidence: {missionConfidence}/5 · Next action: {adaptiveMissionAction.questionType} · Evidence is a local heuristic, not an AI judgment.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="study-tools-mission-continue"
                      onClick={() => {
                        if (missionDone) {
                          setMissionStep(0);
                        } else if (missionScore < 40) {
                          // Weak evidence keeps the learner on the concept instead of pretending it is mastered.
                          setMissionStep(step => step);
                        } else {
                          setMissionStep(step => step + 1);
                        }
                        setMissionAnswer("");
                        setMissionSubmitted(false);
                        setMissionConfidence(0);
                      }}
                    >
                      {missionDone ? "Restart mission" : missionScore < 40 ? "Rebuild & retry" : "Continue mission"} <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {tool === "flashcards" && flashcards.length > 0 && (
              <div className="flashcard-cockpit">
                <div className="flashcard-cockpit-head">
                  <div>
                    <div className="flashcard-breadcrumb">
                      <span className="flashcard-live-dot" /> ACTIVE RECALL
                      <span className="flashcard-slash">/</span>
                      {note.title || "Study deck"}
                    </div>
                    <h4>Can you reconstruct this without the source?</h4>
                  </div>
                  <div className="flashcard-session-score">
                    <span>SESSION</span>
                    <strong>{String(flashcardIndex + 1).padStart(2, "0")} <em>/</em> {String(flashcards.length).padStart(2, "0")}</strong>
                  </div>
                </div>

                <div className="flashcard-progress-track">
                  <span style={{ width: `${((flashcardIndex + 1) / flashcards.length) * 100}%` }} />
                  <div className="flashcard-progress-marks">
                    {flashcards.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        aria-label={`Go to card ${index + 1}`}
                        className={`flashcard-progress-mark ${index === flashcardIndex ? "current" : ""} ${flashcardRatings[index] ?? ""}`}
                        onClick={() => { setFlashcardIndex(index); setFlashcardFlipped(false); }}
                      />
                    ))}
                  </div>
                </div>

                {!deckComplete ? (
                  <>
                    <div className={`flashcard-board palette-${flashcardIndex % 6}`}>
                      <div className="flashcard-board-glow" aria-hidden="true" />
                      <div className="flashcard-board-meta">
                        <div>
                          <span className="flashcard-eyebrow">{flashcards[flashcardIndex].source.toUpperCase()}</span>
                          <span className="flashcard-concept-state">{flashcardFlipped ? "ANSWER REVEALED" : "RETRIEVAL REQUIRED"}</span>
                        </div>
                        <span className="flashcard-number">{String(flashcardIndex + 1).padStart(2, "0")}</span>
                      </div>

                      <div className="flashcard-stage">
                        <div className="flashcard-stack-layer stack-two" aria-hidden="true" />
                        <div className="flashcard-stack-layer stack-one" aria-hidden="true" />

                        <div className={"flashcard-card-zone " + (flashcardTransition === "exiting" ? "is-exiting" : "")}>
                          {flashcards[flashcardIndex + 1] && (
                            <div className="flashcard-next-card" aria-hidden="true">
                              <span className="flashcard-next-label">UP NEXT</span>
                              <strong>{flashcards[flashcardIndex + 1].question}</strong>
                              <span className="flashcard-next-number">{String(flashcardIndex + 2).padStart(2, "0")}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            className={`flashcard-surface ${flashcardFlipped ? "revealed" : ""}`}
                            onClick={() => setFlashcardFlipped(value => !value)}
                            aria-label={flashcardFlipped ? "Hide answer" : "Reveal answer"}
                          >
                            <span className="flashcard-surface-inner">
                              <span className="flashcard-face flashcard-question-face">
                                <span className="flashcard-card-top">
                                  <span className="flashcard-face-label"><Target size={13} /> RETRIEVAL</span>
                                  <span className="flashcard-card-index">{String(flashcardIndex + 1).padStart(2, "0")}</span>
                                </span>
                                <strong>{flashcards[flashcardIndex].question}</strong>
                                <span className="flashcard-card-hint">{flashcardNeed === "retention" ? "Retention is fading · retrieve before rereading" : flashcardNeed === "calibration" ? "Confidence needs a reality check · explain it" : flashcardNeed === "understanding" ? "Recall is ahead · focus on why it works" : "Reconstruct the answer before revealing"} <kbd>Space</kbd></span>
                                <svg className="flashcard-constellation" viewBox="0 0 420 300" aria-hidden="true">
                                  <defs>
                                    <linearGradient id="svFlashGradient" x1="0" y1="0" x2="1" y2="1">
                                      <stop offset="0%" stopColor="currentColor" stopOpacity=".05" />
                                      <stop offset="55%" stopColor="currentColor" stopOpacity=".28" />
                                      <stop offset="100%" stopColor="currentColor" stopOpacity=".02" />
                                    </linearGradient>
                                    <filter id="svFlashGlow">
                                      <feGaussianBlur stdDeviation="5" result="blur" />
                                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                    </filter>
                                  </defs>
                                  <path d="M390 38 C285 24 228 70 236 132 C244 194 168 214 78 270" fill="none" stroke="url(#svFlashGradient)" strokeWidth="1.2" />
                                  <path d="M390 72 C310 58 270 91 273 139 C277 190 217 218 128 268" fill="none" stroke="currentColor" strokeOpacity=".10" />
                                  <path d="M390 107 C331 97 309 119 311 145 C313 174 275 200 190 243" fill="none" stroke="currentColor" strokeOpacity=".08" />
                                  <circle cx="390" cy="38" r="5" fill="currentColor" filter="url(#svFlashGlow)" />
                                  <circle cx="236" cy="132" r="3" fill="currentColor" opacity=".65" />
                                  <circle cx="78" cy="270" r="4" fill="currentColor" opacity=".38" />
                                  <g transform="translate(326 215)">
                                    <rect x="0" y="0" width="18" height="18" rx="2" transform="rotate(45 9 9)" fill="none" stroke="currentColor" strokeOpacity=".22" />
                                    <rect x="30" y="8" width="12" height="12" rx="2" transform="rotate(45 36 14)" fill="none" stroke="currentColor" strokeOpacity=".12" />
                                  </g>
                                </svg>
                              </span>
                              <span className="flashcard-face flashcard-answer-face">
                                <span className="flashcard-card-top">
                                  <span className="flashcard-face-label"><Check size={13} /> VERIFIED SOURCE</span>
                                  <span className="flashcard-card-index">{String(flashcardIndex + 1).padStart(2, "0")}</span>
                                </span>
                                <strong>{flashcards[flashcardIndex].answer}</strong>
                                <span className="flashcard-card-hint">Compare → judge your recall → rate it</span>
                              </span>
                            </span>
                          </button>

                          <div className="flashcard-action-deck">
                            <button
                              type="button"
                              className="flashcard-action again"
                              disabled={!flashcardFlipped}
                              onClick={() => {
                                if (!flashcardFlipped) return;
                                setFlashcardRatings(prev => ({ ...prev, [flashcardIndex]: "missed" }));
                                recordLearningEvent({ conceptId: note.id + "::" + flashcardConcept, questionType: "recall", outcome: "incorrect", confidence: 30, evidenceScore: 0, at: Date.now() });
                                setFlashcardInsight({ type: "missed", concept: flashcardConcept, label: "Gap detected", reason: "This concept is queued for another retrieval attempt." });
                                if (flashcardIndex < flashcards.length - 1) {
                                  setFlashcardTransition("exiting");
                                  window.setTimeout(() => {
                                    setFlashcardIndex(value => value + 1);
                                    setFlashcardFlipped(false);
                                    setFlashcardTransition("idle");
                                  }, 360);
                                }
                              }}
                            >
                              <X size={18} /><span><b>Again</b><small>Didn’t recall</small></span>
                            </button>

                            <button
                              type="button"
                              className="flashcard-action reveal"
                              onClick={() => setFlashcardFlipped(value => !value)}
                            >
                              <RotateCcw size={18} /><span><b>{flashcardFlipped ? "Hide answer" : "Reveal answer"}</b><small><kbd>Space</kbd> {flashcardFlipped ? "flip back" : "flip card"}</small></span>
                            </button>

                            <button
                              type="button"
                              className="flashcard-action got-it"
                              disabled={!flashcardFlipped}
                              onClick={() => {
                                if (!flashcardFlipped) return;
                                setFlashcardRatings(prev => ({ ...prev, [flashcardIndex]: "known" }));
                                recordLearningEvent({ conceptId: note.id + "::" + flashcardConcept, questionType: "recall", outcome: "correct", confidence: 80, evidenceScore: 35, at: Date.now() });
                                setFlashcardInsight({ type: "known", concept: flashcardConcept, label: "Retrieval recorded", reason: "This retrieval now contributes to the concept's learning history." });
                                if (flashcardIndex < flashcards.length - 1) { setFlashcardIndex(value => value + 1); setFlashcardFlipped(false); }
                              }}
                            >
                              <Check size={18} /><span><b>Got it</b><small>Recalled easily</small></span>
                            </button>
                          </div>
                        </div>

                        <aside className="flashcard-context">
                          <span>LEARNING SIGNAL</span>
                          <strong>{flashcardNeed === "retention" ? "RECALL AGAIN" : flashcardNeed === "calibration" ? "CHECK CONFIDENCE" : flashcardNeed === "understanding" ? "EXPLAIN WHY" : "BUILD RECALL"}</strong>
                          <p>{flashcardAction.reason}</p>
                          <div className="flashcard-context-metric"><b>{flashcardMasteryPercent}%</b><span>mastery</span></div>
                          <div className="flashcard-context-meter"><span style={{ width: `${flashcardMasteryPercent}%` }} /></div>
                          <div className="flashcard-context-rule" />
                          <small>Adaptive action is grounded in your learning evidence.</small>
                        </aside>
                      </div>

                     </div>
                    {flashcardInsight && (
                      <div className={`flashcard-insight-toast ${flashcardInsight.type}`}>
                        <span>{flashcardInsight.type === "known" ? "✓" : "!"}</span>
                        <div><b>{flashcardInsight.label}</b><small>{flashcardInsight.reason}</small></div>
                      </div>
                    )}

                    <div className="flashcard-session-footer">
                      <div><span className="signal green">{knownCount}</span><small>retrieved</small></div>
                      <div><span className="signal red">{missedCount}</span><small>revisit</small></div>
                      <div><span className="signal neutral">{flashcards.length - knownCount - missedCount}</span><small>remaining</small></div>
                      <span className="flashcard-session-tip"><Sparkles size={12} /> Retrieval first. Recognition is not mastery.</span>
                    </div>
                  </>
                ) : (
                  <div className="flashcard-finish">
                    <div className="flashcard-finish-ring"><Check size={28} /></div>
                    <span className="flashcard-eyebrow">SESSION COMPLETE</span>
                    <h4>{knownCount === flashcards.length ? "Clean retrieval round." : "You found the gaps."}</h4>
                    <p><b>{knownCount}</b> retrieved · <b>{missedCount}</b> need another pass. StudyVault keeps the weak cards visible instead of hiding them.</p>
                    <div className="flashcard-finish-actions">
                      {missedCards.length > 0 && (
                        <button type="button" className="flashcard-primary-action" onClick={() => { setFlashcardIndex(missedCards[0]); setFlashcardFlipped(false); }}>
                          Revisit {missedCards.length} weak {missedCards.length === 1 ? "card" : "cards"} <RotateCcw size={15} />
                        </button>
                      )}
                      <button type="button" className="flashcard-secondary-action" onClick={() => { setFlashcardRatings({}); setFlashcardIndex(0); setFlashcardFlipped(false); }}>
                        New round
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
