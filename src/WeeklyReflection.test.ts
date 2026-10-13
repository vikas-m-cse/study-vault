import { describe, expect, it } from "vitest";
import { summarizePlannerWeek, weekBounds, type PlannerHistorySession } from "./services/plannerHistory";

const session = (overrides: Partial<PlannerHistorySession> = {}): PlannerHistorySession => ({
  id: "session-1",
  status: "completed",
  createdAt: 100,
  completedAt: 200,
  plannedMinutes: 30,
  energy: "normal",
  goal: "revision",
  tasks: [
    { id: "warmup", title: "Recall", minutes: 5, status: "completed", outcome: "partial" },
    { id: "focus", title: "Focus", minutes: 20, status: "completed" },
    { id: "close", title: "Reflect", minutes: 5, status: "completed" },
  ],
  ...overrides,
});

describe("weekly planner reflection", () => {
  it("summarizes completed sessions inside a half-open date range", () => {
    const summary = summarizePlannerWeek([
      session({ id: "before", completedAt: 99 }),
      session({ id: "inside", completedAt: 100 }),
      session({ id: "end", completedAt: 200 }),
    ], 100, 200);
    expect(summary.completedSessions).toBe(1);
    expect(summary.completedTasks).toBe(3);
    expect(summary.plannedMinutes).toBe(30);
    expect(summary.recallPartial).toBe(1);
  });

  it("counts active calendar days once, not once per session", () => {
    const first = new Date(2026, 9, 12, 10).getTime();
    const second = new Date(2026, 9, 12, 18).getTime();
    const third = new Date(2026, 9, 13, 10).getTime();
    const summary = summarizePlannerWeek([
      session({ id: "a", completedAt: first }),
      session({ id: "b", completedAt: second }),
      session({ id: "c", completedAt: third }),
    ], new Date(2026, 9, 12).getTime(), new Date(2026, 9, 19).getTime());
    expect(summary.activeDays).toBe(2);
  });

  it("uses Monday as the week start and returns a stable local week key", () => {
    const bounds = weekBounds(new Date(2026, 9, 14, 15).getTime());
    expect(new Date(bounds.startAt).getDay()).toBe(1);
    expect(bounds.key).toBe("2026-10-12");
    expect(bounds.endAt - bounds.startAt).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("returns zeroed totals for an empty week", () => {
    expect(summarizePlannerWeek([], 0, 100)).toEqual({
      completedSessions: 0, completedTasks: 0, plannedMinutes: 0,
      recallCorrect: 0, recallPartial: 0, recallIncorrect: 0, activeDays: 0,
    });
  });
});
