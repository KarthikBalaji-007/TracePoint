import { CircleAlert, CircleCheck, CircleDashed, RadioTower } from "lucide-react";
import type { Freshness } from "../types";

const labels: Record<string, string> = {
  CURRENT: "Live data current",
  PROPAGATED: "Nearby live data",
  STALE: "Live data stale",
  NO_DATA: "No live data",
  FEATURES_AFTER_AS_OF: "Cutoff mismatch",
};

export function FreshnessIndicator({ state }: { state: Freshness }) {
  const Icon = state === "CURRENT" || state === "PROPAGATED" ? CircleCheck : state === "STALE" ? CircleAlert : state === "NO_DATA" ? CircleDashed : RadioTower;
  return <span className={`freshness freshness-${String(state).toLowerCase()}`}><Icon size={14} aria-hidden="true" />{labels[state] ?? state}</span>;
}
