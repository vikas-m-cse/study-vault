import { describe, expect, it } from "vitest";
import { buildLearningGaps } from "./learningGaps";
import type { ConceptMastery, LearningEvent } from "./learningCore";

const mastery = (overrides: Partial<ConceptMastery> = {}): ConceptMastery => ({
  attempts: 4,
  correct: 1,
  partial: 1,
  incorrect: 2,
  confidenceSum: 320,
  confidenceCount: 4,
  streak: 0,
  bestLevel: 1,
  dimensionScores: { recall: 20, understanding: 0, application: 0, teaching: 0, transfer: 0 },
  questionTypeAttempts: { recall: 4 },
  lastReviewedAt: 1000,
  nextReviewAt: 1500,
  ...overrides,
});

const event = (conceptId: string, at: number, outcome: LearningEvent["outcome"]): LearningEvent => ({
  conceptId, questionType: "recall", outcome, confidence: 80, at,
});

describe("learning gaps", () => {
  it("ranks weak and overdue concepts ahead of stronger ones", () => {
    const result = buildLearningGaps({
      weak: mastery({ nextReviewAt: 900 }),
      strong: mastery({
        correct: 4, partial: 0, incorrect: 0, confidenceSum: 360,
        dimensionScores: { recall: 90, understanding: 80, application: 80, teaching: 80, transfer: 80 },
        nextReviewAt: 5000, lastReviewedAt: 900,
      }),
    }, [], { weak: "Weak concept", strong: "Strong concept" }, 2000);
    expect(result[0].conceptId).toBe("weak");
    expect(result[0].reasons).toContain("Review is due");
    expect(result[1].label).toBe("Strong concept");
  });

  it("uses recorded attempts only and marks a missing accuracy as untested", () => {
    const result = buildLearningGaps({
      untouched: mastery({ attempts: 0, correct: 0, partial: 0, incorrect: 0, confidenceCount: 0, confidenceSum: 0 }),
    }, [], {}, 2000);
    expect(result[0].accuracy).toBeNull();
    expect(result[0].reasons).toContain("No recorded recall attempts");
  });

  it("ignores future events when choosing the latest outcome", () => {
    const result = buildLearningGaps(
      { topic: mastery({ lastOutcome: "partial" }) },
      [event("topic", 1000, "incorrect"), event("topic", 9000, "correct")],
      {}, 2000,
    );
    expect(result[0].latestOutcome).toBe("incorrect");
  });

  it("returns a stable empty list when no mastery records exist", () => {
    expect(buildLearningGaps({}, [], {}, 2000)).toEqual([]);
  });
});
