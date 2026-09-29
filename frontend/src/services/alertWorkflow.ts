import type { DemoAlert, Prediction, PredictionResponse } from "../types";

/** Application-side draft boundary. This function deliberately performs no chain or wallet action. */
export function prepareAlertDraft(
  prediction: Prediction,
  snapshotId: PredictionResponse["snapshot_id"],
  jurisdictionId: string,
): DemoAlert {
  if (!prediction.model_version || !jurisdictionId) {
    throw new Error("An alert draft requires jurisdiction and model provenance.");
  }
  return {
    alertId: `ALT-${crypto.randomUUID()}`,
    predictionId: prediction.prediction_id,
    zoneId: prediction.zone_id,
    horizon: prediction.horizon,
    riskBand: prediction.risk_band,
    state: "DRAFT",
    preparedAt: new Date().toISOString(),
    fusionVersion: prediction.fusion_version,
    snapshotId,
    modelVersion: prediction.model_version,
    jurisdictionId,
  };
}
