import { AlertTriangle, Clock, Eye, FileText, Flag, MinusCircle, Radio, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Horizon, LiveFeature, Prediction, Zone } from "../types";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { formatScore } from "./RiskCard";

export function InvestigationWorkspace({
  zone,
  prediction,
  liveFeature,
  horizon,
  allPredictions,
  jurisdictionId,
  onPrepareAlert,
  onReview,
  onDismiss,
  onMonitor,
}: {
  zone?: Zone;
  prediction?: Prediction;
  liveFeature?: LiveFeature;
  horizon: Horizon;
  allPredictions: Prediction[];
  jurisdictionId: string;
  onPrepareAlert: (prediction: Prediction) => void;
  onReview: (prediction: Prediction) => void;
  onDismiss: (prediction: Prediction) => void;
  onMonitor: (prediction: Prediction) => void;
}) {
  if (!zone) {
    return (
      <div className="workspace-empty-state">
        <FileText size={32} />
        <h3>Select a Zone for Investigation</h3>
        <p>Choose any priority zone from the Overview or Risk Map to inspect its full evidence dossier.</p>
      </div>
    );
  }

  const zonePredictions = allPredictions.filter((p) => p.zone_id === zone.zone_id);
  const historical = prediction?.explanation?.historical;
  const live = prediction?.explanation?.live;

  return (
    <div className="investigation-workspace">
      {/* Case Context Header */}
      <div className="case-context-card">
        <div className="case-context-header">
          <div>
            <span className="eyebrow">ACTIVE INVESTIGATION DOSSIER</span>
            <h2>{zone.label} <span className="mono text-muted">({zone.zone_id})</span></h2>
          </div>
          <div className="case-context-badges">
            <span className="badge badge-synthetic"><ShieldCheck size={12} />SYNTHETIC DEMO CASE</span>
            <span className="badge badge-jurisdiction">{jurisdictionId}</span>
            {prediction?.risk_band && (
              <span className={`band band-${prediction.risk_band.toLowerCase()}`}>
                {prediction.risk_band} PRIORITY
              </span>
            )}
          </div>
        </div>
        <p className="case-context-notice">
          <strong>Decision Support Notice:</strong> Zone-level predictive intelligence for investigator resource prioritization.
          This model scores relative cash-out risk across urban zones. It does <em>not</em> identify individuals, track accounts, or predict specific ATM terminals.
        </p>
      </div>

      {/* Risk Metrics Summary Grid */}
      <div className="investigation-metrics-grid">
        <div className="investigation-metric-card tone-f">
          <span className="metric-label">FUSED RISK INDEX (F)</span>
          <span className="metric-value mono">{formatScore(prediction?.fused_score_f ?? null)}</span>
          <span className="metric-sub">Horizon: {horizon} · Rank #{prediction?.rank ?? "—"}</span>
        </div>
        <div className="investigation-metric-card tone-h">
          <span className="metric-label">HISTORICAL COMPONENT (H)</span>
          <span className="metric-value mono">{formatScore(prediction?.historical_score_h ?? null)}</span>
          <span className="metric-sub">Weighted: {formatScore(historical?.contribution ?? null)} (w = {prediction?.explanation?.weights?.historical?.toFixed(2) ?? "0.45"})</span>
        </div>
        <div className="investigation-metric-card tone-l">
          <span className="metric-label">LIVE ACTIVITY COMPONENT (L)</span>
          <span className="metric-value mono">{formatScore(prediction?.live_score_l ?? null)}</span>
          <span className="metric-sub">Weighted: {formatScore(live?.contribution ?? null)} (w = {prediction?.explanation?.weights?.live?.toFixed(2) ?? "0.55"})</span>
        </div>
        <div className="investigation-metric-card tone-quality">
          <span className="metric-label">DATA FRESHNESS &amp; QUALITY</span>
          <div className="metric-freshness">
            <FreshnessIndicator state={prediction?.data_quality?.freshness ?? "NO_DATA"} />
          </div>
          <span className="metric-sub">Gate: {prediction?.data_quality?.quality_gate ?? "PASS"}</span>
        </div>
      </div>

      {/* 3-Horizon Forecast Trajectory */}
      <div className="forecast-trajectory-section">
        <div className="section-title-row">
          <span className="eyebrow">TEMPORAL OUTLOOK</span>
          <h3>Forecast Across Horizons</h3>
        </div>
        <div className="trajectory-cards-grid">
          {(["+2h", "+6h", "+24h"] as const).map((h) => {
            const pred = zonePredictions.find((p) => p.horizon === h);
            const isCurrent = h === horizon;
            return (
              <div key={h} className={`trajectory-card ${isCurrent ? "trajectory-card-active" : ""}`}>
                <div className="trajectory-top">
                  <span className="trajectory-horizon mono">{h}</span>
                  {pred?.risk_band && <span className={`band band-${pred.risk_band.toLowerCase()}`}>{pred.risk_band}</span>}
                </div>
                <div className="trajectory-score mono">
                  {formatScore(pred?.fused_score_f ?? null)}
                  <small>FUSED</small>
                </div>
                <div className="trajectory-meta">
                  <span>H: {formatScore(pred?.historical_score_h ?? null)}</span>
                  <span>L: {formatScore(pred?.live_score_l ?? null)}</span>
                  <span>Rank: #{pred?.rank ?? "—"}</span>
                </div>
                <div className="trajectory-time">
                  <Clock size={11} />
                  <span>Valid through: {pred ? new Date(pred.window_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Column Layout: Evidence & Signals */}
      <div className="investigation-details-grid">
        {/* Evidence & Attributions */}
        <div className="investigation-card">
          <div className="card-header">
            <span className="eyebrow">FACTORS &amp; EVIDENCE</span>
            <h3>Model Attribution Breakdown</h3>
          </div>
          <div className="attribution-list">
            <div className="attribution-item">
              <div className="attribution-info">
                <strong>Historical Feature Prior</strong>
                <p>Derived from baseline spatial crime cluster patterns in {zone.label}.</p>
              </div>
              <div className="attribution-stat mono">
                <span>Score: {formatScore(historical?.score ?? null)}</span>
                <small>Events in training: {historical?.feature_event_count ?? "—"}</small>
              </div>
            </div>

            <div className="attribution-item">
              <div className="attribution-info">
                <strong>Live Signal Propagation</strong>
                <p>Calculated via exponential spatio-temporal decay over active incoming signals.</p>
              </div>
              <div className="attribution-stat mono">
                <span>Score: {formatScore(live?.score ?? null)}</span>
                <small>Freshness: {live?.freshness ?? "NO_DATA"}</small>
              </div>
            </div>

            <div className="attribution-item">
              <div className="attribution-info">
                <strong>Observed Amount Band Distribution</strong>
                <div className="amount-pills">
                  {Object.entries(liveFeature?.amount_band_counts ?? {}).map(([band, count]) => (
                    <span key={band} className="pill pill-band">
                      {band.replace("BAND_", "Band ")}: <strong>{count}</strong>
                    </span>
                  ))}
                  {!Object.keys(liveFeature?.amount_band_counts ?? {}).length && (
                    <span className="text-muted">No recent amount band signals recorded</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="metadata-footer">
            <div><span>Model:</span> <code className="mono">{prediction?.model_version ?? "baseline_classifier"}</code></div>
            <div><span>Fusion Engine:</span> <code className="mono">{prediction?.fusion_version ?? "fused_v1"}</code></div>
            <div><span>Snapshot ID:</span> <code className="mono">{prediction?.prediction_id?.slice(0, 16) ?? "—"}…</code></div>
          </div>
        </div>

        {/* Signal Timeline & Decision Panel */}
        <div className="investigation-card">
          <div className="card-header">
            <span className="eyebrow">RECENT SIGNALS</span>
            <h3>Signal Activity in Zone</h3>
          </div>
          <div className="zone-signals-list">
            <div className="signal-row">
              <Radio size={14} className="signal-icon text-accent" />
              <div className="signal-details">
                <strong>Recent Event Influx</strong>
                <span>{liveFeature?.recent_event_count ?? 0} events observed in active window</span>
              </div>
              <span className="signal-time mono">
                {liveFeature?.last_event_at ? new Date(liveFeature.last_event_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Idle"}
              </span>
            </div>
            <div className="signal-row">
              <FileText size={14} className="signal-icon text-muted" />
              <div className="signal-details">
                <strong>Distinct Signal Sources</strong>
                <span>{liveFeature?.distinct_event_count ?? 0} distinct synthetic sources</span>
              </div>
              <span className="signal-time mono">Validated</span>
            </div>
          </div>

          {/* Decision Support Area */}
          <div className="investigator-decision-area">
            <div className="decision-header">
              <ShieldAlert size={16} />
              <h4>Investigator Decision Support</h4>
            </div>
            <p className="decision-sub">
              Human review required before action. Preparing an alert stages a draft for cryptographic signature and on-chain anchoring.
            </p>
            <div className="decision-actions">
              <button className="button button-secondary" disabled={!prediction} onClick={() => prediction && onReview(prediction)}>
                <Eye size={14} /> Review Dossier
              </button>
              <button className="button button-secondary" disabled={!prediction} onClick={() => prediction && onDismiss(prediction)}>
                <MinusCircle size={14} /> Dismiss
              </button>
              <button className="button button-secondary" disabled={!prediction} onClick={() => prediction && onMonitor(prediction)}>
                <Flag size={14} /> Set Monitor
              </button>
              <button className="button button-primary" disabled={!prediction} onClick={() => prediction && onPrepareAlert(prediction)}>
                <Send size={14} /> Prepare Alert
              </button>
            </div>
            <div className="safety-disclaimer">
              <AlertTriangle size={12} />
              <span>TracePoint does NOT autonomously freeze accounts, track individuals, or dispatch law enforcement units.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
