import { describe, expect, it } from "vitest";
import { buildActivityTimeline } from "./activityTimeline";
import type { PlannerHistorySession } from "./plannerHistory";
import type { LearningEvent } from "./learningCore";

const session: PlannerHistorySession = {
  id: "s1", status: "completed", createdAt: 100, completedAt: 200,
  plannedMinutes: 15, energy: "normal", goal: "revision",
  tasks: [{ id: "warmup", title: "Recall", minutes: 5, status: "completed", outcome: "incorrect" }],
};
const event: LearningEvent = {
  conceptId: "note-1::0", questionType: "recall", outcome: "correct", confidence: 80, at: 300,
};

describe("study activity timeline", () => {
  it("combines session, recall, reflection and due-review evidence in reverse chronological order", () => {
    const entries = buildActivityTimeline(
      [session], [event],
      [{ weekKey: "2026-10-12", wentWell: "Focus", nextFocus: "OS", updatedAt: 400 }],
      { "note-1::0": { nextReviewAt: 150 } }, 500,
    );
    expect(entries.map((entry) => entry.kind)).toEqual(["reflection", "review", "planner", "due"]);
    expect(entries.find((entry) => entry.kind === "review")?.outcome).toBe("correct");
  });

  it("does not show unsaved reflections or future due reviews", () => {
    const entries = buildActivityTimeline(
      [], [],
      [{ weekKey: "empty", wentWell: " ", updatedAt: 100 }],
      { "future": { nextReviewAt: 900 } }, 500,
    );
    expect(entries).toEqual([]);
  });

  it("keeps stable identifiers when multiple kinds share a timestamp", () => {
    const entries = buildActivityTimeline([session], [event], [], {}, 500);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });
});
