import { keccak256, toUtf8Bytes } from "ethers";
import type { DemoAlert, Prediction, PredictionResponse } from "../types";
import { createSnapshotCommitment, type PublishCommitments } from "./blockchain/adapters";

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
    blockchainState: "LOCAL_DRAFT",
    preparedAt: new Date().toISOString(),
    fusionVersion: prediction.fusion_version,
    snapshotId,
    modelVersion: prediction.model_version,
    jurisdictionId,
  };
}

/** Prepares salted snapshot commitment and on-chain publish parameters without exposing sensitive details. */
export function createPublishCommitments(alert: DemoAlert, now = Math.floor(Date.now() / 1000)): {
  commitments: PublishCommitments;
  nonce: string;
} {
  const canonicalData = JSON.stringify({
    alertId: alert.alertId,
    predictionId: alert.predictionId,
    snapshotId: alert.snapshotId,
    zoneId: alert.zoneId,
    horizon: alert.horizon,
    riskBand: alert.riskBand,
    modelVersion: alert.modelVersion,
    fusionVersion: alert.fusionVersion,
    jurisdictionId: alert.jurisdictionId,
  });
  const { commitment, nonce } = createSnapshotCommitment(canonicalData);
  const offchainRef = keccak256(toUtf8Bytes(`tracepoint-alert-${alert.alertId}`));
  const expiry = now + 86400;
  const responseDeadline = now + 7200;

  return {
    commitments: {
      jurisdictionId: alert.jurisdictionId,
      snapshotCommitment: commitment,
      offchainRef,
      expiry,
      responseDeadline,
    },
    nonce,
  };
}
