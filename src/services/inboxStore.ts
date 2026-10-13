export type InboxNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  category: "review" | "planner" | "learning";
  href?: "Review" | "Daily Planner" | "Weekly Reflection";
};

export type InboxMessage = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  kind: "personal";
};

const NOTIFICATIONS_KEY = "studyvault-inbox-notifications-v1";
const MESSAGES_KEY = "studyvault-inbox-messages-v1";
const REVIEW_KEY = "studyvault-review-v2";

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, value: T[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readNotifications(): InboxNotification[] {
  return readList<InboxNotification>(NOTIFICATIONS_KEY)
    .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function readMessages(): InboxMessage[] {
  return readList<InboxMessage>(MESSAGES_KEY)
    .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function unreadInboxCount(): number {
  return readNotifications().filter((item) => !item.read).length
    + readMessages().filter((item) => !item.read).length;
}

export function markNotificationRead(id: string): void {
  writeList(NOTIFICATIONS_KEY, readNotifications().map((item) => item.id === id ? { ...item, read: true } : item));
}

export function markAllNotificationsRead(): void {
  writeList(NOTIFICATIONS_KEY, readNotifications().map((item) => ({ ...item, read: true })));
}

export function dismissNotification(id: string): void {
  writeList(NOTIFICATIONS_KEY, readNotifications().filter((item) => item.id !== id));
}

export function markMessageRead(id: string): void {
  writeList(MESSAGES_KEY, readMessages().map((item) => item.id === id ? { ...item, read: true } : item));
}

export function markAllMessagesRead(): void {
  writeList(MESSAGES_KEY, readMessages().map((item) => ({ ...item, read: true })));
}

export function deleteMessage(id: string): void {
  writeList(MESSAGES_KEY, readMessages().filter((item) => item.id !== id));
}

export function savePersonalMessage(title: string, body: string): boolean {
  const cleanTitle = title.trim().slice(0, 100);
  const cleanBody = body.trim().slice(0, 3000);
  if (!cleanTitle || !cleanBody) return false;
  const messages = readMessages();
  const message: InboxMessage = {
    id: `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: cleanTitle,
    body: cleanBody,
    createdAt: Date.now(),
    read: true,
    kind: "personal",
  };
  return writeList(MESSAGES_KEY, [message, ...messages].slice(0, 200));
}

export function syncStudyNotifications(
  sessions: { id: string; completedAt: number; plannedMinutes: number }[],
  events: { conceptId: string; outcome: "correct" | "partial" | "incorrect"; at: number }[],
  now = Date.now(),
): InboxNotification[] {
  const existing = readNotifications();
  const byId = new Map(existing.map((item) => [item.id, item]));
  const generated: InboxNotification[] = [];
  const recentWindow = now - 7 * 24 * 60 * 60 * 1000;

  for (const session of sessions) {
    if (!Number.isFinite(session.completedAt) || session.completedAt < recentWindow) continue;
    const id = `planner-complete-${session.id}`;
    generated.push({
      id,
      title: "Study session completed",
      body: `You completed a ${Math.max(0, session.plannedMinutes)}-minute planner session. Take a moment to note what worked, then plan the next small step.`,
      createdAt: session.completedAt,
      read: byId.get(id)?.read ?? false,
      category: "planner",
      href: "Weekly Reflection",
    });
  }

  const recentEvents = events.filter((event) => Number.isFinite(event.at) && event.at >= recentWindow);
  const newestIncorrect = recentEvents.filter((event) => event.outcome === "incorrect")
    .sort((a, b) => b.at - a.at)[0];
  if (newestIncorrect) {
    const id = `learning-gap-${newestIncorrect.conceptId}-${newestIncorrect.at}`;
    generated.push({
      id,
      title: "A concept may need another look",
      body: "A recent recall attempt was marked incorrect. Try a short retrieval session before rereading the source.",
      createdAt: newestIncorrect.at,
      read: byId.get(id)?.read ?? false,
      category: "learning",
      href: "Review",
    });
  }

  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    const schedules: Record<string, { nextReviewAt?: number }> = raw ? JSON.parse(raw) : {};
    const dueEntries = Object.entries(schedules).filter(([, schedule]) =>
      typeof schedule?.nextReviewAt === "number" && schedule.nextReviewAt <= now,
    );
    if (dueEntries.length > 0) {
      const dueIds = dueEntries.map(([id]) => id).sort();
      const id = `reviews-due-${dueIds.join(",")}`;
      generated.push({
        id,
        title: `${dueEntries.length} review ${dueEntries.length === 1 ? "topic is" : "topics are"} due`,
        body: "Your saved review schedule has topics ready. Open Review and retrieve what you remember before checking the source.",
        createdAt: now,
        read: byId.get(id)?.read ?? false,
        category: "review",
        href: "Review",
      });
    }
  } catch {
    // An invalid optional review schedule must not break the inbox.
  }

  const merged = [...generated, ...existing.filter((item) => !generated.some((next) => next.id === item.id))]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 200);
  writeList(NOTIFICATIONS_KEY, merged);
  return merged;
}
