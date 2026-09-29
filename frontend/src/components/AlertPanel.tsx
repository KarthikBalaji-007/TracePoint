import { Bell, Check, Eye, Flag, MinusCircle, Send } from "lucide-react";
import type { AuditItem, DemoAlert, Prediction } from "../types";

export type InvestigatorAction = "review" | "dismiss" | "monitor" | "publish";

export function AlertPanel({ prediction, alerts, onAction, onMockAdvance, onMockDispute, onMockExpire }: {
  prediction?: Prediction;
  alerts: DemoAlert[];
  onAction: (action: InvestigatorAction, prediction: Prediction) => void;
  onMockAdvance: (alert: DemoAlert) => void;
  onMockDispute: (alert: DemoAlert) => void;
  onMockExpire: (alert: DemoAlert) => void;
}) {
  return (
    <section className="alert-panel" id="alert-workflow" aria-labelledby="alert-title">
      <div className="section-heading">
        <div><span className="eyebrow">OFF-CHAIN DEMO WORKFLOW</span><h2 id="alert-title">Investigator actions</h2></div><Bell size={17} />
      </div>
      <div className="action-buttons">
        <button disabled={!prediction} onClick={() => prediction && onAction("review", prediction)}><Eye size={15} />Review</button>
        <button disabled={!prediction} onClick={() => prediction && onAction("dismiss", prediction)}><MinusCircle size={15} />Dismiss</button>
        <button disabled={!prediction} onClick={() => prediction && onAction("monitor", prediction)}><Flag size={15} />Monitor</button>
        <button className="publish-button" disabled={!prediction || prediction.fused_score_f === null} onClick={() => prediction && onAction("publish", prediction)}><Send size={15} />Publish Alert</button>
      </div>
      <div className="alert-disclaimer">Publish Alert prepares an application-side DRAFT only. No MST transaction is submitted.</div>
      <div className="alert-disclaimer">Local mock transitions exercise the workflow only. They create no wallet signatures, transaction hashes, or chain records.</div>
      <div className="alert-list">
        {alerts.length ? alerts.slice(0, 3).map((alert) => {
          const nextByState: Partial<Record<DemoAlert["state"], string>> = {
            DRAFT: "PUBLISHED", PUBLISHED: "ACKNOWLEDGED", ACKNOWLEDGED: "ACTION_COMMITTED",
            ACTION_COMMITTED: "RESOLVED", DISPUTED: "RESOLVED",
          };
          const next = nextByState[alert.state];
          const canDispute = alert.state === "PUBLISHED" || alert.state === "ACKNOWLEDGED";
          const canExpire = alert.state === "PUBLISHED" || alert.state === "ACTION_COMMITTED" || alert.state === "DISPUTED";
          return <div className="alert-draft" key={alert.alertId}>
            <span className="draft-icon"><Check size={14} /></span><div><strong>{alert.zoneId} · {alert.horizon}</strong><small>{alert.riskBand ?? "Unbanded"} · {alert.state} · {alert.alertId}</small>
              {!next && !canDispute && !canExpire ? <small className="mock-label">MOCK LIFECYCLE COMPLETE</small> : <div className="mock-actions">
                {next && <button onClick={() => onMockAdvance(alert)} aria-label={`Advance mock lifecycle to ${next}`}>MOCK → {next}</button>}
                {canDispute && <button onClick={() => onMockDispute(alert)}>MOCK DISPUTE</button>}
                {canExpire && <button onClick={() => onMockExpire(alert)}>MOCK EXPIRE</button>}
              </div>}
            </div><span className="draft-state">{alert.state}</span>
          </div>;
        }) : <div className="alert-empty">No alert requests prepared in this session.</div>}
      </div>
    </section>
  );
}

export function auditActionFor(action: InvestigatorAction): AuditItem["action"] {
  if (action === "review") return "ZONE_REVIEWED";
  if (action === "dismiss") return "ALERT_DISMISSED";
  if (action === "monitor") return "ZONE_MONITORED";
  return "ALERT_PREPARED";
}
