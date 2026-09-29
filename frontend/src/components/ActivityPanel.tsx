import { Clock3, FileClock } from "lucide-react";
import type { AuditItem } from "../types";

const actionLabels: Record<AuditItem["action"], string> = {
  EVENT_INGESTED: "Synthetic event ingested",
  PREDICTION_REFRESHED: "Prediction refreshed",
  ZONE_REVIEWED: "Zone reviewed",
  ALERT_PREPARED: "Alert prepared",
  ALERT_DISMISSED: "Alert dismissed",
  ZONE_MONITORED: "Zone set to monitor",
  ALERT_STATE_CHANGED: "Mock alert state changed",
};

export function ActivityPanel({ activity }: { activity: AuditItem[] }) {
  return (
    <section className="activity-panel" id="activity-log" aria-labelledby="activity-title">
      <div className="section-heading"><div><span className="eyebrow">SESSION LOG</span><h2 id="activity-title">Recent activity</h2></div><FileClock size={17} /></div>
      {activity.length ? <ol className="activity-list">{activity.slice(0, 8).map((item) => <li key={item.id}>
        <span className={`activity-dot activity-${item.action.toLowerCase()}`} /><div><strong>{actionLabels[item.action]}</strong><small>{item.summary}</small></div><time><Clock3 size={12} />{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      </li>)}</ol> : <div className="activity-empty">Investigator actions will be recorded here for this session.</div>}
    </section>
  );
}
