import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, BookOpen, CalendarCheck, CheckCircle2, Clock3, RefreshCw, Target, TrendingUp } from "lucide-react";
import { getLearningEvents } from "./services/learningCore";
import { readPlannerHistory } from "./services/plannerHistory";
import { buildStudyAnalytics, type AnalyticsSchedule } from "./services/studyAnalytics";
import "./study-analytics.css";

function readSchedules(): Record<string, AnalyticsSchedule> {
  try {
    const raw = localStorage.getItem("studyvault-review-v2");
    return raw ? JSON.parse(raw) as Record<string, AnalyticsSchedule> : {};
  } catch {
    return {};
  }
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export default function StudyAnalytics({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(() => {
    setNow(Date.now());
  }, []);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("studyvault:learning-updated", refresh);
    window.addEventListener("studyvault:inbox-updated", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("studyvault:learning-updated", refresh);
      window.removeEventListener("studyvault:inbox-updated", refresh);
    };
  }, [refresh]);

  const analytics = useMemo(() => buildStudyAnalytics(readPlannerHistory(), getLearningEvents(), readSchedules(), now), [now]);
  const maxMinutes = Math.max(1, ...analytics.weeks.map((week) => week.minutes));
  const hasEvidence = analytics.totalSessions > 0 || analytics.totalAttempts > 0 || analytics.conceptsTracked > 0;

  return (
    <div className="study-analytics-page">
      <header className="study-analytics-header">
        <div><p className="study-analytics-eyebrow"><Activity size={14} /> YOUR LEARNING EVIDENCE</p><h1>Study <em>analytics</em></h1><p>See your study rhythm, retrieval performance and review follow-through using records saved in this browser.</p></div>
        <button className="study-analytics-refresh" onClick={refresh}><RefreshCw size={15} /> Refresh</button>
      </header>

      <section className="study-analytics-kpis" aria-label="Study summary">
        <article><span><CalendarCheck size={17} /></span><small>Completed sessions</small><strong>{analytics.totalSessions}</strong><p>Saved planner sessions</p></article>
        <article><span><Clock3 size={17} /></span><small>Planned study time</small><strong>{formatMinutes(analytics.totalMinutes)}</strong><p>From completed sessions</p></article>
        <article><span><Target size={17} /></span><small>Recall accuracy</small><strong>{analytics.accuracy === null ? "—" : `${analytics.accuracy}%`}</strong><p>{analytics.totalAttempts} recorded attempts · partial = half credit</p></article>
        <article><span><TrendingUp size={17} /></span><small>Active study days</small><strong>{analytics.activeDays}</strong><p>Days with a session or recall attempt</p></article>
      </section>

      {!hasEvidence ? <section className="study-analytics-empty"><span><Activity size={26} /></span><h2>Your trends start with your first record</h2><p>Complete a Daily Planner session or record a recall attempt in Review. This dashboard will chart real activity; it will not fill gaps with estimates.</p><button onClick={() => onNavigate("Daily Planner")}>Start a revision session <ArrowRight size={15} /></button></section> : (
        <>
          <section className="study-analytics-panel">
            <div className="study-analytics-panel-heading"><div><p className="study-analytics-eyebrow">LAST 8 WEEKS</p><h2>Study rhythm</h2></div><span>Completed sessions and planned minutes</span></div>
            <div className="study-analytics-chart" role="img" aria-label="Weekly completed study sessions and planned minutes">
              {analytics.weeks.map((week) => <div className="study-analytics-week" key={week.key} title={`${week.label}: ${week.sessions} sessions, ${week.minutes} minutes`}>
                <div className="study-analytics-bars"><div className="study-analytics-bar study-analytics-bar-sessions" style={{ height: `${week.sessions ? Math.max(5, week.sessions / Math.max(1, ...analytics.weeks.map((item) => item.sessions)) * 100) : 0}%` }} /><div className="study-analytics-bar study-analytics-bar-minutes" style={{ height: `${week.minutes ? Math.max(5, week.minutes / maxMinutes * 100) : 0}%` }} /></div>
                <strong>{week.sessions}</strong><small>{week.label}</small>
              </div>)}
            </div>
            <div className="study-analytics-legend"><span><i className="study-analytics-legend-session" />Sessions</span><span><i className="study-analytics-legend-minutes" />Minutes (scaled)</span></div>
          </section>

          <section className="study-analytics-lower">
            <article className="study-analytics-panel">
              <div className="study-analytics-panel-heading"><div><p className="study-analytics-eyebrow">RETRIEVAL PRACTICE</p><h2>Recall accuracy by week</h2></div><BookOpen size={18} /></div>
              <div className="study-analytics-accuracy-list">
                {analytics.weeks.map((week) => <div className="study-analytics-accuracy-row" key={week.key}><span>{week.label}</span><div className="study-analytics-track"><i style={{ width: `${week.accuracy ?? 0}%` }} /></div><strong>{week.accuracy === null ? "—" : `${week.accuracy}%`}</strong><small>{week.attempts} tries</small></div>)}
              </div>
              <p className="study-analytics-footnote">Accuracy is evidence-based: correct = 1, partial = 0.5, incorrect = 0. It reflects recorded attempts, not exam marks.</p>
            </article>
            <article className="study-analytics-panel study-analytics-review-panel">
              <div className="study-analytics-panel-heading"><div><p className="study-analytics-eyebrow">REVIEW CONSISTENCY</p><h2>Keep reviews moving</h2></div><CheckCircle2 size={18} /></div>
              <div className="study-analytics-review-stat"><strong>{analytics.reviewCoverage === null ? "—" : `${analytics.reviewCoverage}%`}</strong><span>tracked concepts reviewed in the last 7 days</span></div>
              <div className="study-analytics-review-line"><span>Reviewed recently</span><strong>{analytics.conceptsReviewedRecently} / {analytics.conceptsTracked}</strong></div>
              <div className="study-analytics-review-line"><span>Currently due or overdue</span><strong>{analytics.overdueReviews}</strong></div>
              <p className="study-analytics-footnote">Review coverage uses the current saved schedule state. It is not a historical on-time completion rate.</p>
              <button className="study-analytics-action" onClick={() => onNavigate("Review")}>Open review queue <ArrowRight size={15} /></button>
            </article>
          </section>
        </>
      )}
      <p className="study-analytics-privacy">Local evidence only · No AI-generated activity, inferred sessions, or external analytics.</p>
    </div>
  );
}
