import { describe, expect, it } from "vitest";
import { getNextBestAction, type ConceptMastery } from "../services/learningCore";

const mastery = (scores: ConceptMastery["dimensionScores"]): ConceptMastery => ({
  attempts: 5,
  correct: 4,
  partial: 1,
  incorrect: 0,
  confidenceSum: 350,
  confidenceCount: 5,
  streak: 3,
  bestLevel: 2,
  dimensionScores: scores,
  questionTypeAttempts: {},
});

describe("getNextBestAction", () => {
  it("starts new concepts with recall", () => {
    expect(getNextBestAction().questionType).toBe("recall");
  });

  it("moves from recall to understanding", () => {
    const action = getNextBestAction(mastery({ recall: 90, understanding: 40 }));
    expect(action.dimension).toBe("understanding");
    expect(action.questionType).toBe("why");
  });

  it("moves from understanding to application", () => {
    const action = getNextBestAction(mastery({ recall: 90, understanding: 90, application: 40 }));
    expect(action.dimension).toBe("application");
    expect(action.questionType).toBe("application");
  });

  it("eventually challenges strong concepts with transfer", () => {
    const action = getNextBestAction(mastery({
      recall: 90,
      understanding: 90,
      application: 90,
      teaching: 90,
      transfer: 90,
    }));
    expect(action.dimension).toBe("transfer");
    expect(action.questionType).toBe("reverse");
  });
});
