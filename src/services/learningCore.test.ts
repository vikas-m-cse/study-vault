import { beforeEach, describe, expect, it } from "vitest";
import { getMastery, recordLearningEvent, recordMasteryLevel } from "./learningCore";

describe("learning schedule consistency", () => {
  beforeEach(() => localStorage.clear());

  it("stores review timing alongside mastery after a rating", () => {
    recordLearningEvent({
      conceptId: "note-1::0",
      questionType: "recall",
      outcome: "incorrect",
      confidence: 30,
      at: 1_000,
    });

    recordMasteryLevel("note-1::0", 0, 601_000, 1_000);

    expect(getMastery()["note-1::0"]).toMatchObject({
      bestLevel: 0,
      lastReviewedAt: 1_000,
      nextReviewAt: 601_000,
      attempts: 1,
      incorrect: 1,
    });
  });

  it("keeps an existing schedule when callers only update the mastery level", () => {
    recordLearningEvent({
      conceptId: "note-2::0",
      questionType: "recall",
      outcome: "correct",
      confidence: 80,
      at: 2_000,
    });
    recordMasteryLevel("note-2::0", 1, 86_400_000, 2_000);

    recordMasteryLevel("note-2::0", 3);

    expect(getMastery()["note-2::0"]).toMatchObject({
      bestLevel: 3,
      lastReviewedAt: 2_000,
      nextReviewAt: 86_400_000,
    });
  });

  it("ignores invalid schedule timestamps", () => {
    recordLearningEvent({
      conceptId: "note-3::0",
      questionType: "recall",
      outcome: "partial",
      confidence: 55,
      at: 3_000,
    });
    recordMasteryLevel("note-3::0", 1, Number.NaN, Number.POSITIVE_INFINITY);

    expect(getMastery()["note-3::0"]).not.toHaveProperty("nextReviewAt");
    expect(getMastery()["note-3::0"].lastReviewedAt).toBe(3_000);
  });
});
