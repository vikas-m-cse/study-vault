export type QuestionType =
  | "recall"
  | "definition"
  | "why"
  | "how"
  | "compare"
  | "application"
  | "teach"
  | "reverse";

export type MasteryDimension =
  | "recall"
  | "understanding"
  | "application"
  | "teaching"
  | "transfer";

export type ConceptMastery = {
  attempts: number;
  correct: number;
  partial: number;
  incorrect: number;
  confidenceSum: number;
  confidenceCount: number;
  lastReviewedAt?: number;
  nextReviewAt?: number;
  streak: number;
  bestLevel: number;
  dimensionScores: Partial<Record<MasteryDimension, number>>;
  questionTypeAttempts: Partial<Record<QuestionType, number>>;
  evidenceSum?: number;
  evidenceCount?: number;
  lastOutcome?: LearningEvent["outcome"];
  lastQuestionType?: QuestionType;
};

export type LearningEvent = {
  conceptId: string;
  questionType: QuestionType;
  outcome: "correct" | "partial" | "incorrect";
  confidence: number;
  at: number;
  evidenceScore?: number;
};

const STORAGE_KEY = "studyvault-learning-core-v1";
const EVENT_KEY = "studyvault-learning-events-v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Learning data is an enhancement; notes remain stored independently.
  }
}

export function getMastery(): Record<string, ConceptMastery> {
  return read<Record<string, ConceptMastery>>(STORAGE_KEY, {});
}

export function getLearningEvents(): LearningEvent[] {
  return read<LearningEvent[]>(EVENT_KEY, []);
}

export function recordLearningEvent(event: LearningEvent): ConceptMastery {
  const mastery = getMastery();
  const current = mastery[event.conceptId] ?? {
    attempts: 0,
    correct: 0,
    partial: 0,
    incorrect: 0,
    confidenceSum: 0,
    confidenceCount: 0,
    streak: 0,
    bestLevel: 0,
    dimensionScores: {},
    questionTypeAttempts: {},
  };

  current.attempts += 1;
  current.confidenceSum += event.confidence;
  current.confidenceCount += 1;
  if (typeof event.evidenceScore === "number") {
    current.evidenceSum = (current.evidenceSum ?? 0) + event.evidenceScore;
    current.evidenceCount = (current.evidenceCount ?? 0) + 1;
  }
  current.lastOutcome = event.outcome;
  current.lastQuestionType = event.questionType;
  current.questionTypeAttempts[event.questionType] =
    (current.questionTypeAttempts[event.questionType] ?? 0) + 1;

  if (event.outcome === "correct") {
    current.correct += 1;
    current.streak += 1;
  } else if (event.outcome === "partial") {
    current.partial += 1;
    current.streak = 0;
  } else {
    current.incorrect += 1;
    current.streak = 0;
  }

  const dimension: MasteryDimension =
    event.questionType === "application" ? "application"
      : event.questionType === "teach" ? "teaching"
      : event.questionType === "why" || event.questionType === "how" ? "understanding"
      : event.questionType === "reverse" ? "transfer"
      : "recall";

  const oldScore = current.dimensionScores[dimension] ?? 0;
  const outcomeScore = event.outcome === "correct" ? 100 : event.outcome === "partial" ? 60 : 0;
  current.dimensionScores[dimension] = Math.round(oldScore * 0.65 + outcomeScore * 0.35);
  current.lastReviewedAt = event.at;

  mastery[event.conceptId] = current;
  write(STORAGE_KEY, mastery);

  const events = getLearningEvents();
  events.push(event);
  write(EVENT_KEY, events.slice(-1000));

  return current;
}

export function masteryPercent(value?: ConceptMastery): number {
  if (!value || value.attempts === 0) return 0;
  const performance = ((value.correct + value.partial * 0.5) / value.attempts) * 100;
  return Math.round(performance * 0.7 + (value.bestLevel / 5) * 30);
}

export function averageConfidence(value?: ConceptMastery): number {
  if (!value || value.confidenceCount === 0) return 0;
  return Math.round(value.confidenceSum / value.confidenceCount);
}

export function chooseNextInterval(outcome: LearningEvent["outcome"], confidence: number, previousLevel: number): number {
  const base = 10 * 60 * 1000;
  if (outcome === "incorrect") return base;
  if (outcome === "partial") return Math.max(base, 24 * 60 * 60 * 1000 * Math.max(1, previousLevel));
  const days = confidence >= 90 ? [1, 4, 10, 21, 45] : confidence >= 70 ? [1, 3, 7, 14, 30] : [1, 2, 5, 10, 21];
  return days[Math.min(previousLevel, days.length - 1)] * 24 * 60 * 60 * 1000;
}

export type NextLearningAction = {
  dimension: MasteryDimension;
  questionType: QuestionType;
  label: string;
  reason: string;
};

export function retentionEstimate(value?: ConceptMastery, now = Date.now()): number {
  if (!value || value.attempts === 0) return 0;
  const baseMastery = masteryPercent(value) / 100;
  if (!value.lastReviewedAt) return baseMastery;
  const days = Math.max(0, (now - value.lastReviewedAt) / (24 * 60 * 60 * 1000));
  const halfLifeDays = Math.max(1, 1.5 + value.bestLevel * 2.5);
  return Math.max(0, Math.min(1, baseMastery * Math.pow(0.5, days / halfLifeDays)));
}

export function calibrationGap(value?: ConceptMastery): number {
  if (!value || value.attempts === 0) return 0;
  const confidence = averageConfidence(value) / 100;
  const performance = (value.correct + value.partial * 0.5) / value.attempts;
  return Math.round(Math.abs(confidence - performance) * 100);
}

export function learningPriority(value?: ConceptMastery, now = Date.now()): number {
  if (!value || value.attempts === 0) return 100;
  const retention = retentionEstimate(value, now);
  const uncertainty = 1 - masteryPercent(value) / 100;
  const calibration = calibrationGap(value) / 100;
  const overdueDays = value.nextReviewAt && value.nextReviewAt < now
    ? Math.min(1, (now - value.nextReviewAt) / (7 * 24 * 60 * 60 * 1000))
    : 0;
  return Math.round((uncertainty * 0.40 + (1 - retention) * 0.35 + calibration * 0.15 + overdueDays * 0.10) * 100);
}

export function getNextBestAction(value?: ConceptMastery): NextLearningAction {
  if (!value || value.attempts === 0) {
    return {
      dimension: "recall",
      questionType: "recall",
      label: "Start with recall",
      reason: "You have not retrieved this concept yet. Build the first memory trace by answering from memory.",
    };
  }

  const score = (dimension: MasteryDimension) => value.dimensionScores[dimension] ?? 0;

  if (score("recall") < 60) {
    return {
      dimension: "recall",
      questionType: "recall",
      label: "Strengthen recall",
      reason: "Basic retrieval is still unstable. Retrieve the core idea before adding more difficulty.",
    };
  }

  if (score("understanding") < 60) {
    return {
      dimension: "understanding",
      questionType: "why",
      label: "Explain why",
      reason: "You can retrieve the idea, but the next bottleneck is understanding how or why it works.",
    };
  }

  if (score("application") < 60) {
    return {
      dimension: "application",
      questionType: "application",
      label: "Apply it",
      reason: "Your next gain should come from using the concept in a concrete problem or scenario.",
    };
  }

  if (score("teaching") < 60) {
    return {
      dimension: "teaching",
      questionType: "teach",
      label: "Teach it",
      reason: "Explaining the concept in your own words is the next test of organized understanding.",
    };
  }

  if (score("transfer") < 60) {
    return {
      dimension: "transfer",
      questionType: "reverse",
      label: "Transfer it",
      reason: "The concept is familiar; now test whether you can reconstruct and use it in a new context.",
    };
  }

  return {
    dimension: "transfer",
    questionType: "reverse",
    label: "Challenge yourself",
    reason: "Core mastery is strong. A novel application is more valuable than another easy repetition.",
  };
}

export function recordMasteryLevel(conceptId: string, level: number) {
  const mastery = getMastery();
  const current = mastery[conceptId];
  if (!current) return;
  current.bestLevel = Math.max(current.bestLevel, level);
  write(STORAGE_KEY, mastery);
}


export function averageEvidence(value?: ConceptMastery): number {
  if (!value || !value.evidenceCount) return 0;
  return Math.round((value.evidenceSum ?? 0) / value.evidenceCount);
}

export function confidencePerformanceGap(value?: ConceptMastery): number {
  if (!value || value.attempts === 0) return 0;
  const confidence = averageConfidence(value);
  const performance = masteryPercent(value);
  return Math.round(confidence - performance);
}

export function adaptiveNeed(value?: ConceptMastery): "new" | "recall" | "understanding" | "application" | "calibration" | "retention" | "transfer" {
  if (!value || value.attempts === 0) return "new";

  const retention = retentionEstimate(value);
  const calibration = Math.abs(confidencePerformanceGap(value));
  const score = (dimension: MasteryDimension) => value.dimensionScores[dimension] ?? 0;

  if (retention < 0.45) return "retention";
  if (calibration >= 20) return "calibration";
  if (score("recall") < 55) return "recall";
  if (score("understanding") < 60) return "understanding";
  if (score("application") < 60) return "application";
  if (score("transfer") < 60) return "transfer";
  return "transfer";
}

export function getAdaptiveAction(value?: ConceptMastery): NextLearningAction {
  const need = adaptiveNeed(value);

  switch (need) {
    case "new":
      return {
        dimension: "recall",
        questionType: "recall",
        label: "Build the first memory trace",
        reason: "This concept has no retrieval evidence yet. Start with a focused recall attempt.",
      };
    case "retention":
      return {
        dimension: "recall",
        questionType: "recall",
        label: "Retrieve before relearning",
        reason: "Estimated retention has fallen. Try a fresh retrieval before reopening the source.",
      };
    case "calibration":
      return {
        dimension: "understanding",
        questionType: "why",
        label: "Check your confidence",
        reason: "Confidence and demonstrated performance are misaligned. Use an explanation task to recalibrate.",
      };
    case "recall":
      return {
        dimension: "recall",
        questionType: "recall",
        label: "Stabilize recall",
        reason: "Core retrieval is still the bottleneck. Keep the prompt simple and reconstruct from memory.",
      };
    case "understanding":
      return {
        dimension: "understanding",
        questionType: "why",
        label: "Explain the mechanism",
        reason: "Recall is ahead of understanding. Ask why the concept works instead of repeating its definition.",
      };
    case "application":
      return {
        dimension: "application",
        questionType: "application",
        label: "Solve a new situation",
        reason: "The concept is understood in isolation. Transfer it to a problem you have not seen before.",
      };
    default:
      return {
        dimension: "transfer",
        questionType: "reverse",
        label: "Test transfer",
        reason: "Core dimensions are strong enough to justify a novel reconstruction challenge.",
      };
  }
}
