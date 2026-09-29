export const HORIZONS = ["+2h", "+6h", "+24h"] as const;
export type Horizon = (typeof HORIZONS)[number];
export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Freshness = "CURRENT" | "PROPAGATED" | "STALE" | "NO_DATA" | "FEATURES_AFTER_AS_OF" | string;

export interface Zone {
  zone_id: string;
  jurisdiction_id: string;
  label: string;
  centroid?: { lat: number; lon: number } | null;
  cash_point_density?: number | null;
  source_class: string;
  active: boolean;
}

export interface Prediction {
  prediction_id: string;
  zone_id: string;
  horizon: Horizon;
  as_of: string;
  window_start: string;
  window_end: string;
  historical_score_h: number | null;
  live_score_l: number | null;
  fused_score_f: number | null;
  rank: number | null;
  risk_band: RiskBand | null;
  score_semantics: string;
  model_version: string | null;
  fusion_version: string;
  source_provenance: string[];
  synthetic_only: boolean;
  feature_as_of: string | null;
  last_event_at: string | null;
  data_quality: {
    quality_gate: string;
    freshness: Freshness;
    live_data_exists?: boolean;
    missing_components: string[];
    coverage?: string;
  };
  uncertainty: Record<string, unknown> | null;
  explanation: {
    historical?: { score: number | null; contribution: number | null; score_semantics: string; feature_event_count: number };
    live?: {
      score: number | null;
      contribution: number | null;
      ruleset_version: string;
      indicators: Record<string, number | boolean | Record<string, number>>;
      freshness: Freshness;
    };
    weights?: { historical: number; live: number };
  };
}

export interface PredictionResponse {
  snapshot_id: string;
  as_of: string;
  predictions: Prediction[];
}

export interface LiveFeature {
  zone_id: string;
  recent_event_count: number;
  distinct_event_count: number;
  amount_band_counts: Record<string, number>;
  provenance_counts: Record<string, number>;
  last_event_at: string | null;
  latest_processed_at: string | null;
  has_recent_data: boolean;
  as_of: string;
}

export type MapLayer = "fused" | "historical" | "live" | "activity";
export type EventType = "COMPLAINT" | "TRANSACTION_SIGNAL";

export interface AuditItem {
  id: string;
  action: "EVENT_INGESTED" | "PREDICTION_REFRESHED" | "ZONE_REVIEWED" | "ALERT_PREPARED" | "ALERT_DISMISSED" | "ZONE_MONITORED" | "ALERT_STATE_CHANGED";
  summary: string;
  zoneId?: string;
  at: string;
}

export interface DemoAlert {
  alertId: string;
  predictionId: string;
  zoneId: string;
  horizon: Horizon;
  riskBand: RiskBand | null;
  state: "DRAFT" | "PUBLISHED" | "ACKNOWLEDGED" | "ACTION_COMMITTED" | "RESOLVED" | "EXPIRED" | "DISPUTED";
  preparedAt: string;
  fusionVersion: string;
  snapshotId: string;
  modelVersion: string;
  jurisdictionId: string;
  expiresAt?: string;
  responseDeadline?: string;
}
