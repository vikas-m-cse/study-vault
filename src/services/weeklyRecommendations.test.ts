import { describe, expect, it } from "vitest";
import type { Note } from "../types/note";
import { buildNextWeekRecommendations } from "./weeklyRecommendations";
import type { ConceptMastery } from "./learningCore";

const makeNote = (id: string, title: string, subjectId = 1): Note => ({
  id, title, plainText: "A saved source note with enough detail to revise.",
  content: { type: "doc", content: [] }, subjectId, tags: [], pinned: false,
  favourite: false, status: "active", createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-10T00:00:00.000Z", linkedNoteIds: [],
});

const mastery = (overrides: Partial<ConceptMastery> = {}): ConceptMastery => ({
  attempts: 2, correct: 1, partial: 0, incorrect: 1, confidenceSum: 100,
  confidenceCount: 2, streak: 0, bestLevel: 1, dimensionScores: { recall: 30 },
  questionTypeAttempts: { recall: 2 }, lastReviewedAt: 0, ...overrides,
});

describe("next-week learning recommendations", () => {
  it("uses saved active notes and skips archived or empty notes", () => {
    const active = makeNote("a", "Operating systems");
    const archived = { ...makeNote("b", "Archived"), status: "archived" as const };
    const empty = { ...makeNote("c", "Empty"), plainText: "  " };
    const result = buildNextWeekRecommendations([active, archived, empty], [{ id: 1, name: "OS" }], 1000, {});
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Operating systems");
  });

  it("ranks overdue concepts first and explains why they are recommended", () => {
    const now = Date.now();
    const records = {
      "new::0": mastery({ attempts: 0, correct: 0, incorrect: 0, confidenceCount: 0, questionTypeAttempts: {}, dimensionScores: {} }),
      "due::0": mastery({ nextReviewAt: now - 1000 }),
    };
    const result = buildNextWeekRecommendations(
      [makeNote("new", "New topic"), makeNote("due", "Due topic")],
      [{ id: 1, name: "OS" }], now, records,
    );
    expect(result[0].title).toBe("Due topic");
    expect(result[0].label).toBe("Review overdue concept");
    expect(result[0].reason).toContain("next-review time has passed");
  });

  it("returns no recommendations when no active notes have content", () => {
    expect(buildNextWeekRecommendations([], [], Date.now(), {})).toEqual([]);
  });

  it("caps the output to three actionable topics", () => {
    const notes = [makeNote("a", "A"), makeNote("b", "B"), makeNote("c", "C"), makeNote("d", "D")];
    expect(buildNextWeekRecommendations(notes, [{ id: 1, name: "OS" }], Date.now(), {})).toHaveLength(3);
  });
});
