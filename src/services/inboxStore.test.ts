import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissNotification, markAllMessagesRead, markAllNotificationsRead, markMessageRead,
  markNotificationRead, readInboxPreferences, readMessages, readNotifications, saveInboxPreferences, savePersonalMessage,
  syncStudyNotifications, unreadInboxCount,
} from "./inboxStore";

describe("local inbox storage", () => {
  beforeEach(() => localStorage.clear());

  it("creates notifications only from supplied study evidence and preserves read state", () => {
    const sessions = [{ id: "session-1", completedAt: 5000, plannedMinutes: 25 }];
    const events = [{ conceptId: "note-1::0", outcome: "incorrect" as const, at: 4000 }];
    const first = syncStudyNotifications(sessions, events, 6000);
    expect(first.some((item) => item.title === "Study session completed")).toBe(true);
    expect(first.some((item) => item.title === "A concept may need another look")).toBe(true);
    expect(unreadInboxCount()).toBe(2);

    const learningNotice = first.find((item) => item.category === "learning");
    expect(learningNotice).toBeDefined();
    markNotificationRead(learningNotice!.id);
    const refreshed = syncStudyNotifications(sessions, events, 6000);
    expect(refreshed.find((item) => item.id === learningNotice!.id)?.read).toBe(true);
  });

  it("does not create a completed-session notice for old activity", () => {
    const result = syncStudyNotifications(
      [{ id: "old", completedAt: 1, plannedMinutes: 20 }],
      [],
      10 * 24 * 60 * 60 * 1000,
    );
    expect(result.some((item) => item.id === "planner-complete-old")).toBe(false);
  });

  it("validates and saves personal messages locally", () => {
    expect(savePersonalMessage(" ", "body")).toBe(false);
    expect(savePersonalMessage("Exam plan", "Revise scheduling")).toBe(true);
    expect(readMessages()).toHaveLength(1);
    expect(readMessages()[0].title).toBe("Exam plan");
    expect(unreadInboxCount()).toBe(0);
  });

  it("updates read status and dismisses items", () => {
    const [notice] = syncStudyNotifications(
      [{ id: "s1", completedAt: Date.now(), plannedMinutes: 15 }],
      [],
    );
    expect(unreadInboxCount()).toBe(1);
    markNotificationRead(notice.id);
    expect(readNotifications()[0].read).toBe(true);
    markAllNotificationsRead();
    dismissNotification(notice.id);
    expect(readNotifications()).toHaveLength(0);

    savePersonalMessage("One", "Body");
    const [message] = readMessages();
    markMessageRead(message.id);
    markAllMessagesRead();
    expect(readMessages()[0].read).toBe(true);
  });
});
