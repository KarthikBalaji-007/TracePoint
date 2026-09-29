import { Clock3, FileSearch, MapPin, Radio, ShieldCheck } from "lucide-react";
import type { Horizon, LiveFeature, Prediction, Zone } from "../types";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { formatScore } from "./RiskCard";

export function ZoneEvidencePanel({ zone, prediction, liveFeature, horizon }: {
  zone?: Zone;
  prediction?: Prediction;
  liveFeature?: LiveFeature;
  horizon: Horizon;
}) {
  if (!zone) return <section className="evidence-panel evidence-empty"><FileSearch size={22} /><div><span className="eyebrow">ZONE EVIDENCE</span><h2>Select a zone</h2><p>Zone-level evidence and model factors will appear here.</p></div></section>;
  const historical = prediction?.explanation.historical;
  const live = prediction?.explanation.live;
  return (
    <section className="evidence-panel" id="zone-evidence" aria-labelledby="evidence-title">
      <div className="section-heading evidence-heading">
        <div><span className="eyebrow">ZONE INVESTIGATION</span><h2 id="evidence-title">{zone.label}</h2><span className="evidence-id"><MapPin size={13} />{zone.zone_id}</span></div>
        {prediction?.risk_band && <span className={`band band-${prediction.risk_band.toLowerCase()}`}>{prediction.risk_band} PRIORITY</span>}
      </div>
      <div className="evidence-score-grid">
        <ScoreBlock label="FUSED INDEX" value={prediction?.fused_score_f ?? null} tone="f" />
        <ScoreBlock label="HISTORICAL H" value={prediction?.historical_score_h ?? null} tone="h" />
        <ScoreBlock label="LIVE L" value={prediction?.live_score_l ?? null} tone="l" />
        <div className="evidence-rank"><span>RANK · {horizon}</span><strong>{prediction?.rank ? `#${prediction.rank}` : "—"}</strong></div>
      </div>
      <div className="evidence-details">
        <div><span>Model</span><strong className="mono">{prediction?.model_version ?? "Unavailable"}</strong></div>
        <div><span>Fusion ruleset</span><strong className="mono">{prediction?.fusion_version ?? "Unavailable"}</strong></div>
        <div><span>As of</span><strong><Clock3 size={13} />{prediction ? new Date(prediction.as_of).toLocaleString() : "Unavailable"}</strong></div>
        <div><span>Last event</span><strong>{prediction?.last_event_at ? new Date(prediction.last_event_at).toLocaleString() : "No recent event"}</strong></div>
        <div><span>Freshness</span><FreshnessIndicator state={prediction?.data_quality.freshness ?? "NO_DATA"} /></div>
        <div><span>Provenance</span><strong className="provenance-value"><ShieldCheck size={13} />{prediction?.source_provenance.join(" · ") || zone.source_class}</strong></div>
        <div><span>Evidence class</span><strong>{prediction?.synthetic_only ? "SYNTHETIC ONLY" : prediction?.source_provenance.join(" · ") || "Unknown"}</strong></div>
      </div>
      <div className="contribution-block">
        <div className="subheading"><Radio size={15} /><h3>Contributing signals</h3><span>Not causal findings</span></div>
        {prediction ? <div className="contribution-list">
          <div className="contribution-row"><span className="signal-mark historical-mark" /><span>Historical component · raw score</span><strong>{formatScore(historical?.score ?? null)}</strong><small>{formatScore(historical?.contribution ?? null)} weighted contribution</small></div>
          <div className="contribution-row"><span className="signal-mark live-mark" /><span>Live component · {live?.freshness ?? "NO_DATA"}</span><strong>{formatScore(live?.score ?? null)}</strong><small>{formatScore(live?.contribution ?? null)} weighted contribution</small></div>
          <div className="indicator-line"><span>Recent events</span><strong>{liveFeature?.recent_event_count ?? numberIndicator(live?.indicators.recent_event_count)}</strong><span>Distinct signals</span><strong>{liveFeature?.distinct_event_count ?? numberIndicator(live?.indicators.distinct_event_count)}</strong></div>
          <div className="amount-band-list"><span>Amount-band activity</span>{Object.keys(liveFeature?.amount_band_counts ?? {}).length ? Object.entries(liveFeature?.amount_band_counts ?? {}).map(([band, count]) => <span key={band}>{band.replace("BAND_", "Band ")} <strong>{count}</strong></span>) : <em>No recent amount-band activity</em>}</div>
          <div className="weight-line"><span>Fusion weights</span><strong>H {prediction.explanation.weights?.historical.toFixed(2)} · L {prediction.explanation.weights?.live.toFixed(2)}</strong></div>
          {prediction.data_quality.missing_components.length > 0 && <p className="quality-reason">Fusion unavailable: {prediction.data_quality.missing_components.join(", ")}</p>}
        </div> : <div className="empty-evidence">Prediction unavailable for this zone and horizon.</div>}
      </div>
    </section>
  );
}

function ScoreBlock({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return <div className={`evidence-score evidence-score-${tone}`}><span>{label}</span><strong>{formatScore(value)}</strong></div>;
}

function numberIndicator(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
