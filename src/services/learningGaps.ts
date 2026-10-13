import {
  averageConfidence,
  calibrationGap,
  getNextBestAction,
  learningPriority,
  masteryPercent,
  retentionEstimate,
  type ConceptMastery,
  type LearningEvent,
} from "./learningCore";

export type LearningGap = {
  conceptId: string;
  label: string;
  attempts: number;
  accuracy: number | null;
  confidence: number | null;
  calibration: number;
  mastery: number;
  retention: number;
  priority: number;
  lastReviewedAt?: number;
  nextReviewAt?: number;
  latestOutcome?: LearningEvent["outcome"];
  nextAction: ReturnType<typeof getNextBestAction>;
  reasons: string[];
};

export function buildLearningGaps(
  masteryByConcept: Record<string, ConceptMastery>,
  events: LearningEvent[],
  labels: Record<string, string> = {},
  now = Date.now(),
): LearningGap[] {
  return Object.entries(masteryByConcept)
    .map(([conceptId, mastery]) => {
      const attempts = Math.max(0, Number.isFinite(mastery.attempts) ? mastery.attempts : 0);
      const accuracy = attempts
        ? Math.round(((mastery.correct + mastery.partial * 0.5) / attempts) * 100)
        : null;
      const confidence = mastery.confidenceCount > 0 ? averageConfidence(mastery) : null;
      const calibration = calibrationGap(mastery);
      const retention = Math.round(retentionEstimate(mastery, now) * 100);
      const priority = learningPriority(mastery, now);
      const reasons: string[] = [];
      if (attempts === 0) reasons.push("No recorded recall attempts");
      else if (accuracy !== null && accuracy < 60) reasons.push("Recall accuracy needs work");
      if (retention < 50) reasons.push("Estimated retention is low");
      if (typeof mastery.nextReviewAt === "number" && mastery.nextReviewAt <= now) reasons.push("Review is due");
      if (calibration >= 25) reasons.push("Confidence and performance differ");
      if (!reasons.length) reasons.push("Continue strengthening mastery");
      const latestEvent = events
        .filter((event) => event.conceptId === conceptId && Number.isFinite(event.at) && event.at <= now)
        .sort((a, b) => b.at - a.at)[0];
      return {
        conceptId,
        label: labels[conceptId] || conceptId.split("::").slice(1).join(" · ") || conceptId,
        attempts,
        accuracy,
        confidence,
        calibration,
        mastery: masteryPercent(mastery),
        retention,
        priority,
        lastReviewedAt: mastery.lastReviewedAt,
        nextReviewAt: mastery.nextReviewAt,
        latestOutcome: latestEvent?.outcome ?? mastery.lastOutcome,
        nextAction: getNextBestAction(mastery),
        reasons,
      };
    })
    .sort((a, b) => b.priority - a.priority || (a.accuracy ?? -1) - (b.accuracy ?? -1) || a.label.localeCompare(b.label));
}
