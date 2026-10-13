import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, CheckCheck, Inbox as InboxIcon, Mail, MailOpen, MessageSquareText,
  Plus, Send, Trash2, X, BookOpen, CalendarCheck, Brain, Clock3,
} from "lucide-react";
import { getLearningEvents } from "./services/learningCore";
import { readPlannerHistory } from "./services/plannerHistory";
import {
  deleteMessage, dismissNotification, markAllMessagesRead, markAllNotificationsRead,
  markMessageRead, markNotificationRead, readMessages,
  readInboxPreferences, saveInboxPreferences, savePersonalMessage, syncStudyNotifications,\n  type InboxMessage, type InboxNotification, type InboxPreferences,
} from "./services/inboxStore";
import "./inbox.css";

type InboxTab = "notifications" | "messages";

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function categoryIcon(category: InboxNotification["category"]) {
  if (category === "review") return <BookOpen size={18} />;
  if (category === "planner") return <CalendarCheck size={18} />;
  return <Brain size={18} />;
}

export default function Inbox({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [tab, setTab] = useState<InboxTab>("notifications");
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saveError, setSaveError] = useState("");\n  const [showPreferences, setShowPreferences] = useState(false);\n  const [preferences, setPreferences] = useState<InboxPreferences>(() => readInboxPreferences());

  const refresh = useCallback(() => {
    const history = readPlannerHistory();
    const events = getLearningEvents();
    setNotifications(syncStudyNotifications(history, events));
    setMessages(readMessages());
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadInitial = () => { if (mounted) refresh(); };
    Promise.resolve().then(loadInitial);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("studyvault:learning-updated", refresh);
    return () => {
      mounted = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("studyvault:learning-updated", refresh);
    };
  }, [refresh]);

  const unreadNotifications = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);
  const unreadMessages = useMemo(() => messages.filter((item) => !item.read).length, [messages]);

  const handleReadNotification = (item: InboxNotification) => {
    markNotificationRead(item.id);
    refresh();
    if (item.href) onNavigate(item.href);
  };

  const handleSaveMessage = () => {
    setSaveError("");
    if (!title.trim() || !body.trim()) {
      setSaveError("Add a title and message before saving.");
      return;
    }
    if (!savePersonalMessage(title, body)) {
      setSaveError("Could not save this message on this device. Check available storage and try again.");
      return;
    }
    setTitle("");
    setBody("");
    setShowComposer(false);
    setTab("messages");
    refresh();
  };

  return (
    <div className="inbox-page">
      <header className="inbox-header">
        <div>
          <p className="inbox-eyebrow"><MessageSquareText size={14} /> YOUR STUDYVAULT INBOX</p>
          <h1>Stay in the <em>loop.</em></h1>
          <p>Useful study nudges and personal notes, based on what is saved on this device.</p>
        </div>
        <div className="inbox-header-actions">
          <button className="inbox-secondary-button" onClick={() => {
            markAllNotificationsRead(); markAllMessagesRead(); refresh();
          }}><CheckCheck size={16} /> Mark all read</button>
          <button className="inbox-secondary-button" onClick={() => setShowPreferences((visible) => !visible)} aria-expanded={showPreferences}><Bell size={16} /> Preferences</button>\n          <button className="inbox-primary-button" onClick={() => { setShowComposer(true); setSaveError(""); }}><Plus size={16} /> New message</button>
        </div>
      </header>

      {showPreferences && (\n        <section className="inbox-preferences" aria-labelledby="inbox-preferences-title">\n          <div><p className="inbox-eyebrow">YOUR CONTROL</p><h2 id="inbox-preferences-title">Notification preferences</h2><p>Choose which study updates appear in this inbox. Changes are saved on this device.</p></div>\n          <div className="inbox-preference-options">\n            <label><input type="checkbox" checked={preferences.review} onChange={(event) => { const next = { ...preferences, review: event.target.checked }; setPreferences(next); saveInboxPreferences(next); refresh(); }} /><span><strong>Review reminders</strong><small>Topics whose saved review time has arrived</small></span></label>\n            <label><input type="checkbox" checked={preferences.learning} onChange={(event) => { const next = { ...preferences, learning: event.target.checked }; setPreferences(next); saveInboxPreferences(next); refresh(); }} /><span><strong>Learning signals</strong><small>Recent incorrect recall attempts</small></span></label>\n            <label><input type="checkbox" checked={preferences.planner} onChange={(event) => { const next = { ...preferences, planner: event.target.checked }; setPreferences(next); saveInboxPreferences(next); refresh(); }} /><span><strong>Planner updates</strong><small>Completed study sessions</small></span></label>\n          </div>\n        </section>\n      )}\n\n      <div className="inbox-workspace">
        <aside className="inbox-rail" aria-label="Inbox folders">
          <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")} aria-pressed={tab === "notifications"}>
            <Bell size={18} /><span>Notifications</span>{unreadNotifications > 0 && <b>{unreadNotifications}</b>}
          </button>
          <button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")} aria-pressed={tab === "messages"}>
            <Mail size={18} /><span>Messages</span>{unreadMessages > 0 && <b>{unreadMessages}</b>}
          </button>
          <div className="inbox-rail-note"><span className="inbox-local-dot" /> Local-first inbox</div>
        </aside>

        <section className="inbox-list-panel">
          <div className="inbox-list-heading">
            <div><span>{tab === "notifications" ? "STUDY ACTIVITY" : "PERSONAL MESSAGES"}</span><h2>{tab === "notifications" ? "Notifications" : "Messages"}</h2></div>
            <small>{tab === "notifications" ? notifications.length : messages.length} total</small>
          </div>

          {tab === "notifications" ? (
            notifications.length === 0 ? (
              <div className="inbox-empty"><span><Bell size={24} /></span><h3>All quiet for now</h3><p>Study reminders appear here when your saved review schedule or learning activity gives a useful reason to nudge you.</p></div>
            ) : notifications.map((item) => (
              <article key={item.id} className={`inbox-item ${item.read ? "" : "unread"}`}>
                <span className={`inbox-item-icon ${item.category}`}>{categoryIcon(item.category)}</span>
                <button className="inbox-item-content" onClick={() => handleReadNotification(item)}>
                  <span className="inbox-item-meta">{item.category === "review" ? "REVIEW REMINDER" : item.category === "planner" ? "PLANNER UPDATE" : "LEARNING SIGNAL"} · {formatDate(item.createdAt)}</span>
                  <strong>{item.title}</strong><span>{item.body}</span>
                  {item.href && <em>Open {item.href} <span aria-hidden="true">↗</span></em>}
                </button>
                <div className="inbox-item-actions">
                  {!item.read && <button aria-label="Mark notification as read" title="Mark as read" onClick={() => { markNotificationRead(item.id); refresh(); }}><MailOpen size={16} /></button>}
                  <button aria-label="Dismiss notification" title="Dismiss" onClick={() => { dismissNotification(item.id); refresh(); }}><X size={16} /></button>
                </div>
                {!item.read && <span className="inbox-unread-dot" aria-label="Unread" />}
              </article>
            ))
          ) : (
            messages.length === 0 ? (
              <div className="inbox-empty"><span><Mail size={24} /></span><h3>Your message space is ready</h3><p>Save a personal note to yourself—such as a study commitment, reminder or idea—to keep it in this inbox on this device.</p><button className="inbox-primary-button" onClick={() => setShowComposer(true)}><Plus size={15} /> Write a message</button></div>
            ) : messages.map((item) => (
              <article key={item.id} className={`inbox-item ${item.read ? "" : "unread"}`}>
                <span className="inbox-item-icon personal"><MessageSquareText size={18} /></span>
                <button className="inbox-item-content" onClick={() => { markMessageRead(item.id); refresh(); }}>
                  <span className="inbox-item-meta">PERSONAL NOTE · {formatDate(item.createdAt)}</span>
                  <strong>{item.title}</strong><span className="inbox-message-body">{item.body}</span>
                  <em>{item.read ? "Saved on this device" : "Mark as read"}</em>
                </button>
                <div className="inbox-item-actions"><button aria-label="Delete message" title="Delete message" onClick={() => { deleteMessage(item.id); refresh(); }}><Trash2 size={16} /></button></div>
                {!item.read && <span className="inbox-unread-dot" aria-label="Unread" />}
              </article>
            ))
          )}
        </section>

        <aside className="inbox-context-panel">
          <span className="inbox-context-icon"><InboxIcon size={20} /></span>
          <p className="inbox-eyebrow">A QUIETER WORKFLOW</p>
          <h3>Messages with a purpose.</h3>
          <p>Notifications are generated from recorded review dates, recall outcomes and completed planner sessions—not from guessed activity.</p>
          <div className="inbox-context-stat"><Clock3 size={15} /><span>Check in when it suits you</span></div>
          <div className="inbox-context-stat"><MailOpen size={15} /><span>Read status stays saved locally</span></div>
          <p className="inbox-privacy">This is a local inbox. It does not send email, push notifications or messages to other people.</p>
        </aside>
      </div>

      {showComposer && (
        <div className="inbox-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowComposer(false); }}>
          <section className="inbox-composer" role="dialog" aria-modal="true" aria-labelledby="inbox-composer-title">
            <div className="inbox-composer-heading"><div><p className="inbox-eyebrow">PERSONAL MESSAGE</p><h2 id="inbox-composer-title">Leave yourself a note.</h2></div><button aria-label="Close message composer" onClick={() => setShowComposer(false)}><X size={18} /></button></div>
            <p>Keep a commitment, thought or reminder in your StudyVault inbox.</p>
            <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="e.g. Revise process scheduling" /></label>
            <label>Message<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} maxLength={3000} placeholder="Write a note to your future self…" /></label>
            {saveError && <p className="inbox-form-error" role="alert">{saveError}</p>}
            <div className="inbox-composer-footer"><span>Saved only on this device</span><button className="inbox-primary-button" onClick={handleSaveMessage}><Send size={15} /> Save message</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
