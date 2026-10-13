import { describe, expect, it } from "vitest";
import { buildStudyAnalytics, type AnalyticsSchedule } from "./studyAnalytics";
import type { LearningEvent } from "./learningCore";
import type { PlannerHistorySession } from "./plannerHistory";

const day = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 13, 12).getTime();
const session = (id: string, completedAt: number, plannedMinutes = 30): PlannerHistorySession => ({
  id, status: "completed", createdAt: completedAt - 1000, completedAt, plannedMinutes,
  energy: "normal", goal: "revision", tasks: [{ id: "task", title: "Recall", minutes: 20, status: "completed" }],
});
const event = (conceptId: string, at: number, outcome: LearningEvent["outcome"]): LearningEvent => ({
  conceptId, questionType: "recall", outcome, confidence: 70, at,
});

describe("study analytics", () => {
  it("summarizes completed sessions and weighted recall outcomes by week", () => {
    const result = buildStudyAnalytics(
      [session("s1", now - day, 30), session("s2", now - 2 * day, 20)],
      [event("a", now - day, "correct"), event("b", now - day, "partial"), event("c", now - day, "incorrect")],
      {}, now, 2,
    );
    const current = result.weeks[1];
    expect(current.sessions).toBe(2);
    expect(current.minutes).toBe(50);
    expect(current.attempts).toBe(3);
    expect(current.accuracy).toBe(50);
    expect(result.totalMinutes).toBe(50);
    expect(result.totalAttempts).toBe(3);
  });

  it("reports review coverage and overdue items from saved schedules", () => {
    const schedules: Record<string, AnalyticsSchedule> = {
      recently: { lastReviewedAt: now - day, nextReviewAt: now + day },
      old: { lastReviewedAt: now - 10 * day, nextReviewAt: now - day },
      future: { lastReviewedAt: now - 2 * day, nextReviewAt: now + 3 * day },
    };
    const result = buildStudyAnalytics([], [], schedules, now, 1);
    expect(result.conceptsTracked).toBe(3);
    expect(result.conceptsReviewedRecently).toBe(2);
    expect(result.reviewCoverage).toBe(67);
    expect(result.overdueReviews).toBe(1);
  });

  it("does not count future activity and keeps empty metrics honest", () => {
    const result = buildStudyAnalytics(
      [session("future", now + day)],
      [event("future", now + day, "correct")],
      {}, now, 8,
    );
    expect(result.totalSessions).toBe(0);
    expect(result.totalAttempts).toBe(0);
    expect(result.accuracy).toBeNull();
    expect(result.weeks.every((week) => week.sessions === 0 && week.accuracy === null)).toBe(true);
  });

  it("bounds requested week count", () => {
    expect(buildStudyAnalytics([], [], {}, now, 0).weeks).toHaveLength(1);
    expect(buildStudyAnalytics([], [], {}, now, 100).weeks).toHaveLength(52);
  });
});
