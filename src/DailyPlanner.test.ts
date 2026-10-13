import { describe, expect, it } from "vitest";
import { buildRevisionPlan, rankRevisionCandidates, type RevisionCandidate } from "./services/dailyPlanner";

const candidate = (overrides: Partial<RevisionCandidate> = {}): RevisionCandidate => ({
  id: "note-1::0",
  noteId: "note-1",
  noteTitle: "Operating Systems",
  excerpt: "A process is a program in execution.",
  updatedAt: "2026-10-12T10:00:00.000Z",
  due: false,
  priority: 40,
  attempts: 2,
  ...overrides,
});

describe("adaptive revision plan", () => {
  it("allocates exactly 30 minutes for a normal revision session", () => {
    const plan = buildRevisionPlan(
      { availableMinutes: 30, energy: "normal", goal: "revision", now: 1000 },
      [candidate()],
    );
    expect(plan.totalMinutes).toBe(30);
    expect(plan.tasks.map((task) => task.minutes)).toEqual([5, 20, 5]);
    expect(plan.fallbackUsed).toBe(false);
  });

  it("keeps very short sessions within the chosen budget", () => {
    for (const minutes of [5, 10, 15]) {
      const plan = buildRevisionPlan(
        { availableMinutes: minutes, energy: "low", goal: "revision", now: 1000 },
        [candidate()],
      );
      expect(plan.totalMinutes).toBe(minutes);
      expect(plan.tasks.every((task) => task.minutes > 0)).toBe(true);
    }
  });

  it("prefers due reviews, then higher recorded priority", () => {
    const ranked = rankRevisionCandidates([
      candidate({ id: "weak", due: false, priority: 90 }),
      candidate({ id: "due", due: true, priority: 10 }),
      candidate({ id: "other", due: false, priority: 30 }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["due", "weak", "other"]);
  });

  it("ignores candidates without source text", () => {
    const ranked = rankRevisionCandidates([
      candidate({ id: "empty", excerpt: "", due: true, priority: 100 }),
      candidate({ id: "usable", excerpt: "A useful source passage." }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["usable"]);
  });

  it("provides an honest fallback when no notes are available", () => {
    const plan = buildRevisionPlan(
      { availableMinutes: 30, energy: "normal", goal: "revision", now: 1000 },
      [],
    );
    expect(plan.fallbackUsed).toBe(true);
    expect(plan.totalMinutes).toBe(30);
    expect(plan.tasks[0].noteId).toBeUndefined();
  });

  it("normalizes invalid and out-of-range time selections", () => {
    expect(buildRevisionPlan(
      { availableMinutes: 31, energy: "normal", goal: "revision", now: 1000 },
      [candidate()],
    ).totalMinutes).toBe(30);
  });
});
