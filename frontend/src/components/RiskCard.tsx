import { ArrowUpRight, Clock3 } from "lucide-react";
import type { Horizon, Prediction, Zone } from "../types";

export function formatScore(score: number | null): string {
  return score === null ? "Unavailable" : score.toFixed(3);
}

export function RiskCard({ horizon, prediction, zone, active, onSelect }: {
  horizon: Horizon;
  prediction?: Prediction;
  zone?: Zone;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`risk-card ${active ? "risk-card-active" : ""}`} onClick={onSelect} aria-label={`View top risk for ${horizon}`}>
      <span className="risk-card-top"><span>{horizon} window</span><ArrowUpRight size={15} /></span>
      <strong className="risk-card-zone">{zone?.label ?? "No ranked zone"}</strong>
      <span className="risk-card-bottom">
        <span className="mono">{formatScore(prediction?.fused_score_f ?? null)} <small>FUSED INDEX</small></span>
        <span>{prediction?.rank ? `#${prediction.rank}` : "No rank"}</span>
      </span>
      <span className="risk-card-window"><Clock3 size={12} />{prediction ? `through ${new Date(prediction.window_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Forecast unavailable"}</span>
    </button>
  );
}
