import type { Note } from "../types/note";
import {
  getAdaptiveAction, getMastery, learningPriority, masteryPercent, retentionEstimate,
  type ConceptMastery,
} from "./learningCore";
import { conceptIdsForNote } from "./dailyPlanner";

export type NextWeekRecommendation = {
  conceptId: string;
  noteId: string;
  title: string;
  conceptLabel: string;
  subjectName?: string;
  priority: number;
  due: boolean;
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
    .flatMap((note) => conceptIdsForNote(note.id, masteryRecords).map((conceptId) => {
      const mastery = masteryRecords[conceptId];
      const action = getAdaptiveAction(mastery);
      const retention = Math.round(retentionEstimate(mastery, now) * 100);
      const due = typeof mastery?.nextReviewAt === "number" && mastery.nextReviewAt <= now;
      const priority = learningPriority(mastery, now) + (due ? 25 : 0);
      const suffix = conceptId.slice(note.id.length + 2);
      const conceptIndex = Number(suffix);
      const conceptLabel = Number.isInteger(conceptIndex) && conceptIndex >= 0
        ? `Concept ${conceptIndex + 1}`
        : `Concept ${suffix}`;
      return {
        conceptId,
        noteId: note.id,
        title: note.title || "Untitled note",
        conceptLabel,
        subjectName: subjects.find((subject) => subject.id === note.subjectId)?.name,
        priority,
        due,
        mastery: masteryPercent(mastery),
        retention,
        label: due ? "Review overdue concept" : action.label,
        reason: due
          ? "Its recorded next-review time has passed. Start with a retrieval attempt before rereading."
          : action.reason,
        actionType: action.questionType,
        minutes: priority >= 80 ? 20 : priority >= 50 ? 15 : 10,
      };
    }))
    .sort((a, b) => Number(b.due) - Number(a.due) || b.priority - a.priority || a.retention - b.retention || a.title.localeCompare(b.title) || a.conceptId.localeCompare(b.conceptId))
    .slice(0, 3);
}
