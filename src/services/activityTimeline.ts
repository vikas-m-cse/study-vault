import type { LearningEvent } from "./learningCore";
import type { PlannerHistorySession } from "./plannerHistory";

export type ActivityKind = "planner" | "review" | "reflection" | "due";
export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  at: number;
  outcome?: "correct" | "partial" | "incorrect";
  href: "Daily Planner" | "Review" | "Weekly Reflection";
};

export type ActivityReflection = {
  weekKey: string;
  wentWell?: string;
  feltDifficult?: string;
  nextFocus?: string;
  updatedAt: number;
};

export function buildActivityTimeline(
  sessions: PlannerHistorySession[],
  events: LearningEvent[],
  reflections: ActivityReflection[],
  schedules: Record<string, { nextReviewAt?: number; lastReviewedAt?: number }> = {},
  now = Date.now(),
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const session of sessions) {
    if (!Number.isFinite(session.completedAt)) continue;
    entries.push({
      id: `planner-${session.id}`, kind: "planner", title: "Study session completed",
      detail: `${session.plannedMinutes} minutes planned · ${session.tasks.filter((task) => task.status === "completed").length} tasks completed`,
      at: session.completedAt, href: "Weekly Reflection",
    });
  }
  for (const event of events) {
    if (!Number.isFinite(event.at)) continue;
    entries.push({
      id: `review-${event.conceptId}-${event.at}`, kind: "review",
      title: event.outcome === "correct" ? "Recall successful" : event.outcome === "partial" ? "Recall partly correct" : "Recall needs another attempt",
      detail: `${event.questionType.replace(/_/g, " ")} · confidence ${Math.max(0, Math.min(100, event.confidence))}%`,
      at: event.at, outcome: event.outcome, href: "Review",
    });
  }
  for (const reflection of reflections) {
    const hasText = [reflection.wentWell, reflection.feltDifficult, reflection.nextFocus].some((value) => Boolean(value?.trim()));
    if (!hasText || !Number.isFinite(reflection.updatedAt)) continue;
    entries.push({
      id: `reflection-${reflection.weekKey}`, kind: "reflection", title: "Weekly reflection saved",
      detail: reflection.nextFocus?.trim() ? `Next focus: ${reflection.nextFocus.trim().slice(0, 140)}` : "Your weekly notes were saved locally.",
      at: reflection.updatedAt, href: "Weekly Reflection",
    });
  }
  for (const [conceptId, schedule] of Object.entries(schedules)) {
    if (typeof schedule?.nextReviewAt !== "number" || schedule.nextReviewAt > now || !Number.isFinite(schedule.nextReviewAt)) continue;
    entries.push({
      id: `due-${conceptId}-${schedule.nextReviewAt}`, kind: "due", title: "Review became due",
      detail: "This topic reached its saved review time. Try retrieval before reopening the source.",
      at: schedule.nextReviewAt, href: "Review",
    });
  }
  return entries.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, 1000);
}
