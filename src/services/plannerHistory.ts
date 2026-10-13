export type PlannerHistoryTask = {
  id: string;
  title: string;
  minutes: number;
  status: "pending" | "active" | "completed" | "skipped";
  outcome?: "correct" | "partial" | "incorrect";
};

export type PlannerHistorySession = {
  id: string;
  status: "completed";
  createdAt: number;
  completedAt: number;
  plannedMinutes: number;
  energy: "low" | "normal" | "high";
  goal: "revision" | "new_learning" | "exam_prep";
  tasks: PlannerHistoryTask[];
};

export type WeeklyPlannerSummary = {
  completedSessions: number;
  completedTasks: number;
  plannedMinutes: number;
  recallCorrect: number;
  recallPartial: number;
  recallIncorrect: number;
  activeDays: number;
};

const HISTORY_KEY = "studyvault-planner-history-v1";

export function readPlannerHistory(): PlannerHistorySession[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is PlannerHistorySession =>
      Boolean(item)
      && typeof item.id === "string"
      && item.status === "completed"
      && Number.isFinite(item.completedAt)
      && Array.isArray(item.tasks)
    ).sort((a, b) => b.completedAt - a.completedAt);
  } catch {
    return [];
  }
}

export function recordCompletedPlannerSession(session: PlannerHistorySession): void {
  const history = readPlannerHistory();
  if (history.some((item) => item.id === session.id)) return;
  localStorage.setItem(HISTORY_KEY, JSON.stringify([session, ...history].slice(0, 500)));
}

export function summarizePlannerWeek(
  sessions: PlannerHistorySession[],
  startAt: number,
  endAt: number,
): WeeklyPlannerSummary {
  const included = sessions.filter((session) => session.completedAt >= startAt && session.completedAt < endAt);
  const activeDays = new Set(included.map((session) => {
    const date = new Date(session.completedAt);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  })).size;

  return included.reduce<WeeklyPlannerSummary>((summary, session) => {
    summary.completedSessions += 1;
    summary.plannedMinutes += Math.max(0, session.plannedMinutes);
    summary.completedTasks += session.tasks.filter((task) => task.status === "completed").length;
    for (const task of session.tasks) {
      if (task.id !== "warmup" || !task.outcome) continue;
      if (task.outcome === "correct") summary.recallCorrect += 1;
      else if (task.outcome === "partial") summary.recallPartial += 1;
      else summary.recallIncorrect += 1;
    }
    return summary;
  }, {
    completedSessions: 0,
    completedTasks: 0,
    plannedMinutes: 0,
    recallCorrect: 0,
    recallPartial: 0,
    recallIncorrect: 0,
    activeDays,
  });
}

export function weekBounds(anchor: number): { startAt: number; endAt: number; key: string } {
  const date = new Date(anchor);
  date.setHours(0, 0, 0, 0);
  const dayFromMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayFromMonday);
  const startAt = date.getTime();
  const end = new Date(startAt);
  end.setDate(end.getDate() + 7);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { startAt, endAt: end.getTime(), key: `${year}-${month}-${day}` };
}
