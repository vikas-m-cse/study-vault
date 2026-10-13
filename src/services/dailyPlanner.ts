export type PlannerEnergy = "low" | "normal" | "high";
export type PlannerGoal = "revision" | "new_learning" | "exam_prep";
export type PlannerTaskKind = "warmup" | "focus" | "close";

export interface PlannerInput {
  availableMinutes: number;
  energy: PlannerEnergy;
  goal: PlannerGoal;
  now: number;
}

export interface RevisionCandidate {
  id: string;
  noteId: string;
  noteTitle: string;
  subjectName?: string;
  excerpt: string;
  updatedAt: string;
  due: boolean;
  priority: number;
  attempts: number;
}

export interface PlannedRevisionTask {
  id: string;
  kind: PlannerTaskKind;
  title: string;
  description: string;
  minutes: number;
  candidateId?: string;
  noteId?: string;
  sourceTitle?: string;
  sourceExcerpt?: string;
  rationale: string;
}

export interface RevisionPlan {
  totalMinutes: number;
  tasks: PlannedRevisionTask[];
  selectedCandidateId?: string;
  fallbackUsed: boolean;
}

export function normalizeAvailableMinutes(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(5, Math.min(120, Math.round(value / 5) * 5));
}

/**
 * Returns every known review concept for a note, plus a first-review fallback
 * when no concept-level mastery has been recorded yet.
 */
export function conceptIdsForNote(
  noteId: string,
  mastery: Record<string, { attempts?: number }>,
  schedules: Record<string, unknown> = {},
): string[] {
  const prefix = `${noteId}::`;
  const known = new Set([
    ...Object.keys(mastery).filter((id) => id.startsWith(prefix)),
    ...Object.keys(schedules).filter((id) => id.startsWith(prefix)),
  ]);
  if (known.size === 0) known.add(`${noteId}::0`);
  return [...known].sort((a, b) => {
    const aIndex = Number(a.slice(prefix.length));
    const bIndex = Number(b.slice(prefix.length));
    return Number.isFinite(aIndex) && Number.isFinite(bIndex) ? aIndex - bIndex : a.localeCompare(b);
  });
}

export function rankRevisionCandidates(candidates: RevisionCandidate[]): RevisionCandidate[] {
  return candidates
    .filter((candidate) => candidate.excerpt.trim().length > 0)
    .slice()
    .sort((a, b) =>
      Number(b.due) - Number(a.due)
      || b.priority - a.priority
      || a.attempts - b.attempts
      || b.updatedAt.localeCompare(a.updatedAt)
      || a.id.localeCompare(b.id)
    );
}

export function buildRevisionPlan(
  input: PlannerInput,
  candidates: RevisionCandidate[],
): RevisionPlan {
  const minutes = normalizeAvailableMinutes(input.availableMinutes);
  const ranked = rankRevisionCandidates(candidates);
  const candidate = ranked[0];
  const tasks: PlannedRevisionTask[] = [];

  if (minutes <= 10) {
    const warmup = Math.max(2, minutes - 2);
    tasks.push({
      id: "warmup",
      kind: "warmup",
      title: candidate ? "Recall one key idea" : "Choose one thing to revise",
      description: candidate
        ? "Before opening the source, say or write the main idea from memory."
        : "Pick a topic you already studied and name its most important idea.",
      minutes: warmup,
      candidateId: candidate?.id,
      noteId: candidate?.noteId,
      sourceTitle: candidate?.noteTitle,
      sourceExcerpt: candidate?.excerpt,
      rationale: candidate ? candidateRationale(candidate) : "No eligible saved note was found.",
    });
    tasks.push({
      id: "close",
      kind: "close",
      title: "Choose the next step",
      description: "Record what you remembered and what you want to revisit.",
      minutes: minutes - warmup,
      rationale: "A short close keeps the next session easy to restart.",
    });
  } else {
    const closeMinutes = 5;
    const warmupMinutes = 5;
    const focusMinutes = minutes - closeMinutes - warmupMinutes;
    tasks.push({
      id: "warmup",
      kind: "warmup",
      title: candidate ? "Recall one key idea" : "Pick a revision topic",
      description: candidate
        ? "Without looking at the note, explain its central idea in your own words."
        : "Choose a topic you have studied before and write down what you remember.",
      minutes: warmupMinutes,
      candidateId: candidate?.id,
      noteId: candidate?.noteId,
      sourceTitle: candidate?.noteTitle,
      sourceExcerpt: candidate?.excerpt,
      rationale: candidate ? candidateRationale(candidate) : "No eligible saved note was found.",
    });
    tasks.push({
      id: "focus",
      kind: "focus",
      title: input.goal === "exam_prep" ? "Practise an exam-style answer" : "Revise one priority topic",
      description: input.energy === "low"
        ? "Read the source slowly, clarify one gap, and summarise the main idea."
        : input.goal === "exam_prep"
          ? "Use the source to structure an answer, then check what you missed."
          : "Review the source, identify one gap, and explain the topic without copying.",
      minutes: focusMinutes,
      candidateId: candidate?.id,
      noteId: candidate?.noteId,
      sourceTitle: candidate?.noteTitle,
      sourceExcerpt: candidate?.excerpt,
      rationale: candidate ? candidateRationale(candidate) : "Use your own topic selection; no saved source was available.",
    });
    tasks.push({
      id: "close",
      kind: "close",
      title: "Close the loop",
      description: "Summarise one thing you learned and choose a next action.",
      minutes: closeMinutes,
      rationale: "A short reflection creates a clear restart point for the next session.",
    });
  }

  return {
    totalMinutes: tasks.reduce((sum, task) => sum + task.minutes, 0),
    tasks,
    selectedCandidateId: candidate?.id,
    fallbackUsed: !candidate,
  };
}

function candidateRationale(candidate: RevisionCandidate): string {
  if (candidate.due) return "Selected because this concept is due for review.";
  if (candidate.attempts === 0) return "Selected because this note has no recorded recall attempts yet.";
  return "Selected using recorded learning priority and note recency.";
}
