import type { LearningEvent } from "./learningCore";
import type { PlannerHistorySession } from "./plannerHistory";

export type AnalyticsSchedule = { nextReviewAt?: number; lastReviewedAt?: number };
export type AnalyticsWeek = {
  key: string;
  label: string;
  startAt: number;
  sessions: number;
  minutes: number;
  attempts: number;
  accuracy: number | null;
  activeDays: number;
};
export type StudyAnalytics = {
  weeks: AnalyticsWeek[];
  totalSessions: number;
  totalMinutes: number;
  totalAttempts: number;
  accuracy: number | null;
  activeDays: number;
  conceptsTracked: number;
  conceptsReviewedRecently: number;
  overdueReviews: number;
  reviewCoverage: number | null;
};

const DAY = 24 * 60 * 60 * 1000;

function weekStart(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

function weekLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function buildStudyAnalytics(
  sessions: PlannerHistorySession[],
  events: LearningEvent[],
  schedules: Record<string, AnalyticsSchedule> = {},
  now = Date.now(),
  weekCount = 8,
): StudyAnalytics {
  const safeWeekCount = Math.max(1, Math.min(52, Number.isFinite(weekCount) ? Math.floor(weekCount) : 8));
  const currentStart = weekStart(now);
  const starts = Array.from({ length: safeWeekCount }, (_, index) => {
    const date = new Date(currentStart);
    date.setDate(date.getDate() - (safeWeekCount - index - 1) * 7);
    return date.getTime();
  });
  const weeks: AnalyticsWeek[] = starts.map((startAt) => {
    const endAt = startAt + 7 * DAY;
    const weekSessions = sessions.filter((session) => Number.isFinite(session.completedAt) && session.completedAt <= now && session.completedAt >= startAt && session.completedAt < endAt);
    const weekEvents = events.filter((event) => Number.isFinite(event.at) && event.at <= now && event.at >= startAt && event.at < endAt);
    const outcomes = weekEvents.length;
    const score = weekEvents.reduce((sum, event) => sum + (event.outcome === "correct" ? 1 : event.outcome === "partial" ? 0.5 : 0), 0);
    const active = new Set<number>();
    weekSessions.forEach((session) => active.add(new Date(session.completedAt).setHours(0, 0, 0, 0)));
    weekEvents.forEach((event) => active.add(new Date(event.at).setHours(0, 0, 0, 0)));
    return {
      key: new Date(startAt).toISOString().slice(0, 10),
      label: weekLabel(startAt),
      startAt,
      sessions: weekSessions.length,
      minutes: weekSessions.reduce((sum, session) => sum + Math.max(0, Number.isFinite(session.plannedMinutes) ? session.plannedMinutes : 0), 0),
      attempts: outcomes,
      accuracy: outcomes ? Math.round((score / outcomes) * 100) : null,
      activeDays: active.size,
    };
  });
  const validEvents = events.filter((event) => Number.isFinite(event.at) && event.at <= now);
  const validSessions = sessions.filter((session) => Number.isFinite(session.completedAt) && session.completedAt <= now);
  const score = validEvents.reduce((sum, event) => sum + (event.outcome === "correct" ? 1 : event.outcome === "partial" ? 0.5 : 0), 0);
  const activeDates = new Set<number>();
  validSessions.forEach((session) => activeDates.add(new Date(session.completedAt).setHours(0, 0, 0, 0)));
  validEvents.forEach((event) => activeDates.add(new Date(event.at).setHours(0, 0, 0, 0)));
  const tracked = Object.values(schedules).filter((item) => Number.isFinite(item.lastReviewedAt) || Number.isFinite(item.nextReviewAt));
  const recentlyReviewed = tracked.filter((item) => typeof item.lastReviewedAt === "number" && item.lastReviewedAt >= now - 7 * DAY && item.lastReviewedAt <= now).length;
  const overdue = Object.values(schedules).filter((item) => typeof item.nextReviewAt === "number" && Number.isFinite(item.nextReviewAt) && item.nextReviewAt <= now).length;
  return {
    weeks,
    totalSessions: validSessions.length,
    totalMinutes: validSessions.reduce((sum, session) => sum + Math.max(0, Number.isFinite(session.plannedMinutes) ? session.plannedMinutes : 0), 0),
    totalAttempts: validEvents.length,
    accuracy: validEvents.length ? Math.round((score / validEvents.length) * 100) : null,
    activeDays: activeDates.size,
    conceptsTracked: tracked.length,
    conceptsReviewedRecently: recentlyReviewed,
    overdueReviews: overdue,
    reviewCoverage: tracked.length ? Math.round((recentlyReviewed / tracked.length) * 100) : null,
  };
}
