import type { Note } from "../types/note";
import {
  getAdaptiveAction, getMastery, learningPriority, masteryPercent, retentionEstimate,
  type ConceptMastery,
} from "./learningCore";

export type NextWeekRecommendation = {
  conceptId: string;
  noteId: string;
  title: string;
  subjectName?: string;
  priority: number;
  mastery: number;
  retention: number;
  label: string;
  reason: string;
  actionType: string;
  minutes: number;
};

export function buildNextWeekRecommendations(
  notes: Note[],
  subjects: { id: number; name: string }[],
  now: number,
  masteryRecords: Record<string, ConceptMastery> = getMastery(),
): NextWeekRecommendation[] {
  return notes
    .filter((note) => note.status === "active" && Boolean((note.plainText || "").trim()))
    .map((note) => {
      const conceptId = `${note.id}::0`;
      const mastery = masteryRecords[conceptId];
      const action = getAdaptiveAction(mastery);
      const retention = Math.round(retentionEstimate(mastery, now) * 100);
      const due = Boolean(mastery?.nextReviewAt && mastery.nextReviewAt <= now);
      const priority = learningPriority(mastery, now) + (due ? 25 : 0);
      return {
        conceptId,
        noteId: note.id,
        title: note.title || "Untitled note",
        subjectName: subjects.find((subject) => subject.id === note.subjectId)?.name,
        priority,
        mastery: masteryPercent(mastery),
        retention,
        label: due ? "Review overdue concept" : action.label,
        reason: due
          ? "Its recorded next-review time has passed. Start with a retrieval attempt before rereading."
          : action.reason,
        actionType: action.questionType,
        minutes: priority >= 80 ? 20 : priority >= 50 ? 15 : 10,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.retention - b.retention || a.title.localeCompare(b.title))
    .slice(0, 3);
}
