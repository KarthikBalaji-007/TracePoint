import { ArrowDownWideNarrow, ArrowUpRight } from "lucide-react";
import type { Horizon, Prediction, Zone } from "../types";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { formatScore } from "./RiskCard";

export function RankingTable({ horizon, predictions, zones, selectedZoneId, onSelect }: {
  horizon: Horizon;
  predictions: Prediction[];
  zones: Zone[];
  selectedZoneId: string | null;
  onSelect: (zoneId: string) => void;
}) {
  const zoneById = new Map(zones.map((zone) => [zone.zone_id, zone]));
  const rows = predictions.filter((prediction) => prediction.horizon === horizon)
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.zone_id.localeCompare(b.zone_id));
  return (
    <section className="ranking-section" id="ranking" aria-labelledby="ranking-title">
      <div className="section-heading">
        <div><span className="eyebrow">PRIORITY QUEUE</span><h2 id="ranking-title">Zone ranking</h2></div>
        <span className="section-meta"><ArrowDownWideNarrow size={14} />{rows.filter((row) => row.fused_score_f !== null).length} ranked</span>
      </div>
      <div className="table-scroll">
        <table className="ranking-table">
          <thead><tr><th>Rank</th><th>Zone</th><th>Fused</th><th>H</th><th>L</th><th>Band</th><th>Last event / freshness</th><th><span className="sr-only">Open zone</span></th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const zone = zoneById.get(row.zone_id);
              return <tr key={row.prediction_id} className={selectedZoneId === row.zone_id ? "selected-row" : ""}>
                <td className="rank-cell">{row.rank ? String(row.rank).padStart(2, "0") : <span className="muted">—</span>}</td>
                <td><button className="table-zone" onClick={() => onSelect(row.zone_id)}><strong>{zone?.label ?? row.zone_id}</strong><small>{row.zone_id}</small></button></td>
                <td className="score-cell score-f">{formatScore(row.fused_score_f)}</td>
                <td className="score-cell score-h">{formatScore(row.historical_score_h)}</td>
                <td className="score-cell score-l">{formatScore(row.live_score_l)}</td>
                <td>{row.risk_band ? <span className={`band band-${row.risk_band.toLowerCase()}`}>{row.risk_band}</span> : <span className="muted">—</span>}</td>
                <td className="freshness-cell"><span>{row.last_event_at ? new Date(row.last_event_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No event"}</span><FreshnessIndicator state={row.data_quality.freshness} /></td>
                <td><button className="icon-button table-open" aria-label={`Open ${row.zone_id}`} onClick={() => onSelect(row.zone_id)}><ArrowUpRight size={16} /></button></td>
              </tr>;
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-table">No predictions for this horizon and scope.</div>}
      </div>
      <p className="table-note">Scores are relative prioritization indices, not probabilities.</p>
    </section>
  );
}
