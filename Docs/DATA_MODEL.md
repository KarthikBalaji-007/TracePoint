# TracePoint Data Model

This document translates [ARCHITECTURE.md](ARCHITECTURE.md) into logical data contracts. It defines payload semantics, not database schemas, routes, or contract code. Sensitive records and detailed prediction payloads are stored off-chain. Every entity carrying demo data preserves its provenance label.

## Conventions

| Convention | Definition |
| --- | --- |
| `ID` | Opaque, non-semantic identifier. Use random IDs; do not encode names, account numbers, or precise location. |
| Timestamp | RFC 3339 timestamp with UTC offset, normalized to UTC for comparison. Keep event time separate from receipt/processing time. |
| Score | Normalized numeric risk index in `[0,1]`. It is a calibrated probability only when an approved calibration is documented; otherwise it is a relative score. |
| Provenance | `REAL_AUTHORIZED`, `SYNTHETIC`, or `MANUAL_DEMO`. Propagate to derived events and predictions. |
| Sensitivity | `No` means intended to be non-sensitive in this contract; `Yes` means restricted off-chain data. Treat all values as sensitive if source policy requires it. |
| MST reference | Fields permitted in the minimal MST alert record. This does not authorize putting the corresponding off-chain value on-chain. |

## Entities

### 1. Zone

| Field | Type | Required | Sensitive | MST reference | Definition |
| --- | --- | --- | --- | --- | --- |
| `zone_id` | ID | Yes | No | Yes, opaque/coarse identifier | Stable operational zone identifier. |
| `jurisdiction_id` | ID | Yes | No | Yes, coarse code only | Agency jurisdiction responsible for the zone. |
| `label` | String | Yes | Sometimes | No | Human-readable zone name; omit or generalize if it reveals a sensitive location. |
| `geometry` | Polygon or multipolygon (WGS84) | Optional | Yes | No | Off-chain boundary used for aggregation and map display. |
| `centroid` | `{lat: Number, lon: Number}` | Optional | Yes | No | Derived map coordinate; keep off-chain when operationally sensitive. |
| `cash_point_density` | Number or `null` | Optional | Yes | No | Available ATM/POS density or count, with source and as-of metadata. |
| `source_class` | Enum | Yes | No | No | `REAL_AUTHORIZED`, `SYNTHETIC`, or `MANUAL_DEMO`; indicates zone-data provenance. |
| `active` | Boolean | Yes | No | No | Whether the zone is eligible for current ranking. |
| `created_at`, `updated_at` | Timestamp | Yes | No | No | Record timestamps. |

**Purpose:** Candidate geographic unit for aggregation, scoring, ranking, and jurisdictional response.  
**Relationships:** A Zone has many ComplaintEvents, Predictions, and Alerts; it belongs to one jurisdiction. A Zone may be associated with off-chain cash-point records, but those records are not defined as a separate contract here.

### 2. ComplaintEvent

| Field | Type | Required | Sensitive | MST reference | Definition |
| --- | --- | --- | --- | --- | --- |
| `event_id` | ID | Yes | No | No | TracePoint-generated event identifier. |
| `source_event_id` | String | Conditional | Yes | No | Source's event/complaint identifier; keep off-chain and access-restricted. |
| `event_type` | Enum | Yes | No | No | Normalized signal type, such as `COMPLAINT`, `TRANSACTION_SIGNAL`, `CASHOUT_OBSERVED`, or `CORRECTION`. |
| `event_time` | Timestamp | Yes | No | No | Time the underlying incident/signal occurred. |
| `received_at` | Timestamp | Yes | No | No | Time TracePoint accepted the event. |
| `jurisdiction_id` | ID | Yes | No | No | Authorized jurisdiction association. |
| `zone_id` | ID or `null` | Yes | No | No | Candidate Zone; null when unresolved. |
| `location` | `{lat: Number, lon: Number}` or `null` | Optional | Yes | No | Precise coordinates, restricted off-chain. |
| `amount_band` | Enum or `null` | Optional | Yes | No | Coarse authorized amount band; raw amounts are excluded from this contract. |
| `channel` | String or `null` | Optional | Yes | No | Transaction/reporting channel where authorized. |
| `category` | String or `null` | Optional | Yes | No | Complaint or fraud category. |
| `correlation_ref` | ID | Yes | Yes | No | Non-identifying off-chain link across related events/cases. |
| `provenance` | Enum | Yes | No | No | `REAL_AUTHORIZED`, `SYNTHETIC`, or `MANUAL_DEMO`. |
| `source_ref` | ID/String | Yes | Yes | No | Restricted source-system reference; never publish source credentials. |
| `idempotency_key` | String | Yes | Yes | No | Deduplication key; unique within the authenticated source scope. |
| `quality` | Object | Yes | No | No | Validation status, missing-field indicators, and source-confidence descriptor. |
| `status` | Enum | Yes | No | No | `ACCEPTED`, `QUARANTINED`, `CORRECTED`, or `REJECTED`. |

**Purpose:** Normalized, time-stamped complaint or transaction-related signal used by the live processor and eligible historical pipeline. Raw complaint text, identity, account identifiers, evidence, and raw financial values are separate restricted off-chain fields and are not returned in this normalized contract.  
**Relationships:** Belongs to a Zone when resolved; links to an off-chain case/source record via `correlation_ref` and `source_ref`; may be referenced as input provenance by multiple Predictions. Corrections create a linked event rather than silently rewriting the original.

### 3. Prediction

| Field | Type | Required | Sensitive | MST reference | Definition |
| --- | --- | --- | --- | --- | --- |
| `prediction_id` | ID | Yes | No | No | Immutable prediction snapshot identifier. |
| `zone_id` | ID | Yes | No | Yes, coarse identifier through Alert | Candidate Zone being scored. |
| `horizon` | Enum | Yes | No | Yes | `+2h`, `+6h`, or `+24h`. |
| `as_of` | Timestamp | Yes | No | No | Cutoff time for inputs and score calculation. |
| `window_start`, `window_end` | Timestamp | Yes | No | `window_end` maps to alert expiry | Future interval represented by the horizon. |
| `historical_score_h` | Number `[0,1]` or `null` | Yes | No | No | `H`: historical-model score. Null means unavailable; must not be silently replaced with zero. |
| `live_score_l` | Number `[0,1]` or `null` | Yes | No | No | `L`: live event/spatio-temporal score. Null means unavailable. |
| `fused_score_f` | Number `[0,1]` or `null` | Yes | No | No | `F`: versioned fusion output; null if required inputs are missing or quality gate fails. |
| `rank` | Integer or `null` | Yes | No | No | Rank among candidates in the same jurisdiction, horizon, and snapshot. |
| `risk_band` | Enum or `null` | Yes | No | Yes | Operational prioritization band, e.g. `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`; thresholds are versioned. Not a claim of guilt. |
| `score_semantics` | Enum | Yes | No | No | `CALIBRATED_PROBABILITY` only with approved calibration; otherwise `RELATIVE_RISK_INDEX`. |
| `model_version` | String or `null` | Yes | No | Yes | Approved historical model version, or null if unavailable. |
| `fusion_version` | String | Yes | No | Yes | Version/configuration identifier for fusion rule and horizon weights. |
| `source_provenance` | Enum[] | Yes | No | No | Provenance classes used: real authorized, synthetic, manual demo. |
| `synthetic_only` | Boolean | Yes | No | No | True when all input evidence is synthetic/demo. |
| `input_event_refs` | ID[] | Yes | Yes | No | Off-chain IDs of events used; do not expose on MST. |
| `feature_as_of` | Timestamp | Yes | No | No | Latest time represented in computed features. |
| `last_event_at` | Timestamp or `null` | Yes | No | No | Latest relevant event time for live component. |
| `data_quality` | Object | Yes | No | No | Coverage, freshness, missing component indicators, source confidence, and quality-gate result. |
| `uncertainty` | Object or `null` | Yes | No | No | Validated uncertainty/coverage summary; null if not supported. Do not use an uncalibrated heuristic interval. |
| `explanation` | Object[] | Yes | Yes | No | Off-chain factors, source timestamps, and component contribution details. Avoid causal claims. |
| `created_at` | Timestamp | Yes | No | No | Snapshot creation time. |

**Purpose:** Immutable, auditable ranked estimate for one Zone and one future horizon, with historical (`H`), live (`L`), and fused (`F`) components preserved separately.  
**Relationships:** Belongs to one Zone; may cite multiple ComplaintEvents off-chain; may be referenced by one or more Alerts through opaque prediction reference and salted snapshot commitment. Scores and explanation stay off-chain.

**Horizon semantics:** `+2h`, `+6h`, and `+24h` identify the future window from `as_of`. The API should return one Prediction per candidate Zone per requested horizon. `window_start` is the prediction cutoff and `window_end` is `as_of` plus the horizon; implementations must use a consistent UTC representation. A request may select a subset, but the hackathon dashboard supports all three.

**Fusion semantics:** `F(z,h) = wH(h) * H(z,h) + wL(h) * L(z,h)` only when required inputs are present and the quality gate passes. Store the fusion version and component scores. Missing inputs remain null with a reason in `data_quality`; no silent zero-filling. A risk band is a prioritization category, not proof or an accusation.

### 4. Alert

| Field | Type | Required | Sensitive | MST reference | Definition |
| --- | --- | --- | --- | --- | --- |
| `alert_id` | Random opaque ID | Yes | No | Yes | Unique, non-semantic identifier; duplicate publication is rejected. |
| `prediction_id` | ID | Yes | Yes | No | Off-chain link to the full Prediction snapshot. |
| `snapshot_commitment` | Bytes32/hash commitment | Yes | No, but linkable | Yes | Commitment to canonical off-chain prediction snapshot using a random nonce/salt. Never use a raw low-entropy hash. |
| `zone_id` | ID | Yes | Potentially | Yes, coarse only | Coarse zone/jurisdiction identifier; no exact geometry/coordinates. |
| `horizon` | Enum | Yes | No | Yes | `+2h`, `+6h`, or `+24h`. |
| `risk_band` | Enum | Yes | No | Yes | Coarse operational priority band; no precise score. |
| `model_version` | String | Yes | No | Yes | Model version associated with the snapshot. |
| `fusion_version` | String | Yes | No | Yes | Fusion/ruleset version associated with the snapshot. |
| `state` | Enum | Yes | No | Yes | Current lifecycle state. |
| `publisher_actor_id` | ID | Yes | Yes | No | Off-chain Actor reference. |
| `publisher_wallet` | Wallet address | Conditional | Linkable | Yes | Signing wallet for publication. Not proof of real-world identity. |
| `acknowledger_wallet` | Wallet address or `null` | Optional | Linkable | Yes | Responder wallet that acknowledged. |
| `expiry` | Timestamp | Yes | No | Yes | Time after which an unresolved alert can expire. |
| `response_deadline` | Timestamp or `null` | Optional | No | Yes | Optional deadline for a response commitment. |
| `offchain_ref` | Random opaque reference | Yes | Linkable | Yes | Authorized service lookup key; reveals no record content by itself. |
| `created_at`, `updated_at` | Timestamp | Yes | No | Yes | State transition timestamps. |
| `resolution_code` | Enum or `null` | Optional | Sometimes | No | Coarse outcome code; detailed narrative stays off-chain. |
| `dispute_ref` | ID or `null` | Optional | Yes | No | Restricted off-chain dispute details. |

**Purpose:** Coordinate and audit an authorized response to a reviewed Prediction. MST tracks workflow and signatures; it does not carry the complete forecast or case.  
**Relationships:** References one Prediction and one publisher Actor, may reference an acknowledger/responder Actor, and has many AuditEvents. Detailed responder assignment, intervention, case, and dispute data are off-chain.

#### Alert lifecycle states

| State | Meaning | Allowed next state(s) |
| --- | --- | --- |
| `DRAFT` | Prepared off-chain; not yet published to MST. | `PUBLISHED` |
| `PUBLISHED` | Published by an authorized investigator and awaiting response. | `ACKNOWLEDGED`, `EXPIRED`, `DISPUTED` |
| `ACKNOWLEDGED` | Authorized responder acknowledged the alert. | `ACTION_COMMITTED`, `DISPUTED` |
| `ACTION_COMMITTED` | Responder recorded an operational commitment. | `RESOLVED`, `EXPIRED` |
| `RESOLVED` | Outcome recorded by an authorized responder/reviewer. | Terminal |
| `EXPIRED` | Alert/deadline elapsed without further action or was closed as expired. | Terminal |
| `DISPUTED` | Authorized reviewer challenged the alert/workflow record. | `RESOLVED`, `EXPIRED` |

State transitions and role checks are enforced by MST. A correction creates a new linked event/alert; history is not silently overwritten. `DRAFT` is an application state and need not be stored on MST.

### 5. Actor

| Field | Type | Required | Sensitive | MST reference | Definition |
| --- | --- | --- | --- | --- | --- |
| `actor_id` | ID | Yes | Yes | No | Internal actor identity reference. |
| `actor_type` | Enum | Yes | No | No | `INVESTIGATOR`, `RESPONDER`, `REVIEWER`, or `SYSTEM`. |
| `display_name` | String | Yes | Yes | No | Restricted name shown in authorized application contexts. |
| `agency_id` | ID | Yes | Yes | No | Off-chain agency/organization association. |
| `jurisdiction_ids` | ID[] | Yes | Yes | No | Jurisdictions for application-level access checks. |
| `wallet_address` | String or `null` | Optional | Linkable | Yes | BridgeKey-connected public address used for signing permitted MST actions. |
| `wallet_provider` | String or `null` | Optional | No | No | Wallet connection provider label, e.g. BridgeKey. |
| `roles` | Enum[] | Yes | Yes | No | Application roles; wallet possession does not grant these roles. |
| `status` | Enum | Yes | No | No | `ACTIVE`, `SUSPENDED`, or `REVOKED`. |
| `created_at`, `updated_at` | Timestamp | Yes | No | No | Account record timestamps. |

**Purpose:** Represents a human or system identity authorized for off-chain actions. BridgeKey proves control of a wallet key; the application separately binds that address to an authenticated Actor and checks roles.  
**Relationships:** An Actor may publish, acknowledge, commit, resolve, dispute, or access records; its identity and agency mapping remain off-chain. Only the wallet address needed to verify an MST signature is referenced on-chain.

### 6. AuditEvent

| Field | Type | Required | Sensitive | MST reference | Definition |
| --- | --- | --- | --- | --- | --- |
| `audit_event_id` | ID | Yes | No | No | Unique application audit record. |
| `actor_id` | ID or `null` | Yes | Yes | No | Authenticated Actor who performed the operation; null for system events. |
| `action` | Enum/String | Yes | Sometimes | Yes, coarse transition name only | Operation such as `EVENT_INGESTED`, `PREDICTION_VIEWED`, `ALERT_PUBLISHED`, `ALERT_ACKNOWLEDGED`, `RESPONSE_COMMITTED`, `ALERT_RESOLVED`, or `ALERT_DISPUTED`. |
| `entity_type` | Enum | Yes | No | No | `ZONE`, `COMPLAINT_EVENT`, `PREDICTION`, or `ALERT`. |
| `entity_id` | ID | Yes | Yes | Opaque Alert ID only where needed | Off-chain entity reference. Do not publish case/event IDs. |
| `occurred_at` | Timestamp | Yes | No | Yes, for MST transitions | Time action occurred. |
| `purpose` | String/Enum | Conditional | Yes | No | Operational purpose for sensitive data access. |
| `result` | Enum | Yes | No | No | `SUCCESS`, `DENIED`, or `FAILURE`. |
| `source_class` | Enum or `null` | Optional | No | No | Provenance context where applicable. |
| `chain_tx_ref` | String or `null` | Optional | Linkable | Yes | Transaction/event reference for an MST transition. |
| `details` | Object | Optional | Yes | No | Restricted details; must not duplicate raw PII or financial data. |

**Purpose:** Record access and operational actions for application accountability and investigation. Keep detailed audit records off-chain; MST itself provides an immutable record of authorized lifecycle transitions.  
**Relationships:** References an Actor and the affected entity; Alert lifecycle AuditEvents may link to a chain transaction. Audit records should not contain raw source data, credentials, or full prediction features.

## Data Placement Summary

| Off-chain only / restricted | May be referenced on MST |
| --- | --- |
| Names and contact details; account/UPI/card identifiers; narratives and evidence; precise coordinates and zone geometry; ATM-level tactical locations; raw and exact transaction amounts; device/network identifiers; source credentials and source IDs; event/case correlation links; feature vectors; full H/L/F scores and explanations; uncertainty details; actor-to-wallet identity mapping; detailed assignments, notes, dispute evidence, and resolution narrative. | Random opaque Alert ID; coarse Zone/jurisdiction ID; horizon; risk band; expiry/deadline; model and fusion/ruleset versions; salted snapshot commitment; publisher/acknowledger/responder wallet addresses; lifecycle state and transition timestamps; coarse transition code; opaque authorized lookup reference; chain transaction/event references. |

MST references are minimized metadata, not a mirror of the off-chain entities. A commitment uses a random nonce/salt and canonical snapshot encoding. Even a hash, wallet address, or opaque reference can be linkable; access and publication policy must account for that.

## Core API Payload Shapes

These shapes are logical request/response contracts. Authentication, authorization, field validation, and transport details are handled by the architecture's API boundary. Sensitive values are omitted from responses unless the caller is authorized.

### Ingest event

**Request**

```json
{
  "source_event_id": "source-scoped-id",
  "event_type": "COMPLAINT",
  "event_time": "2026-09-29T10:15:00Z",
  "jurisdiction_id": "JUR-opaque",
  "zone_id": "ZONE-opaque",
  "location": null,
  "amount_band": "BAND_2",
  "channel": "UPI",
  "category": "PHISHING",
  "correlation_ref": "opaque-correlation-id",
  "provenance": "SYNTHETIC",
  "idempotency_key": "source-scope:unique-value"
}
```

**Response**

```json
{
  "event_id": "EVT-random-id",
  "status": "ACCEPTED",
  "provenance": "SYNTHETIC",
  "received_at": "2026-09-29T10:15:03Z",
  "duplicate": false
}
```

`source_event_id` and idempotency keys are source-scoped and restricted. Raw PII, evidence, and exact financial values are submitted only through an authorized protected source channel and remain off-chain.

### Generate/get prediction

**Request**

```json
{
  "jurisdiction_id": "JUR-opaque",
  "zone_ids": ["ZONE-a", "ZONE-b"],
  "horizons": ["+2h", "+6h", "+24h"],
  "as_of": "2026-09-29T10:15:00Z"
}
```

**Response**

```json
{
  "snapshot_id": "PREDSET-random-id",
  "as_of": "2026-09-29T10:15:00Z",
  "predictions": [
    {
      "prediction_id": "PRED-random-id",
      "zone_id": "ZONE-a",
      "horizon": "+2h",
      "window_start": "2026-09-29T10:15:00Z",
      "window_end": "2026-09-29T12:15:00Z",
      "historical_score_h": 0.61,
      "live_score_l": 0.73,
      "fused_score_f": 0.67,
      "rank": 1,
      "risk_band": "HIGH",
      "score_semantics": "RELATIVE_RISK_INDEX",
      "model_version": "model-version",
      "fusion_version": "fusion-version",
      "source_provenance": ["SYNTHETIC"],
      "synthetic_only": true,
      "feature_as_of": "2026-09-29T10:14:00Z",
      "last_event_at": "2026-09-29T10:12:00Z",
      "data_quality": {
        "quality_gate": "PASS",
        "freshness": "CURRENT",
        "coverage": "DEMO",
        "missing_components": []
      },
      "uncertainty": null
    }
  ]
}
```

Return one ranked row per zone/horizon. Authorized clients may receive off-chain explanation factors and input references. Null component scores stay null; a failed quality gate can make `fused_score_f` and `rank` null.

### Publish alert

**Request**

```json
{
  "prediction_id": "PRED-random-id",
  "expiry": "2026-09-29T12:15:00Z",
  "response_deadline": "2026-09-29T10:45:00Z",
  "reason_code": "PRIORITIZE_REVIEW",
  "snapshot_commitment": "0x...",
  "commitment_nonce": "random-secret-value"
}
```

`commitment_nonce` is used to create/verify the salted commitment and is stored off-chain; it is not an on-chain field. The investigator reviews the action and signs the resulting MST transaction through BridgeKey.

**Response**

```json
{
  "alert_id": "ALERT-random-id",
  "state": "PUBLISHED",
  "zone_id": "ZONE-coarse",
  "horizon": "+2h",
  "risk_band": "HIGH",
  "expiry": "2026-09-29T12:15:00Z",
  "publisher_wallet": "0x...",
  "chain_tx_ref": "0x..."
}
```

### Acknowledge alert

**Request**

```json
{
  "alert_id": "ALERT-random-id",
  "acknowledgement_code": "RECEIVED",
  "comment_ref": "optional-offchain-reference"
}
```

**Response**

```json
{
  "alert_id": "ALERT-random-id",
  "state": "ACKNOWLEDGED",
  "acknowledger_wallet": "0x...",
  "occurred_at": "2026-09-29T10:20:00Z",
  "chain_tx_ref": "0x..."
}
```

### Commit response

**Request**

```json
{
  "alert_id": "ALERT-random-id",
  "commitment_code": "REVIEW_AND_PATROL",
  "response_deadline": "2026-09-29T11:00:00Z",
  "assignment_ref": "restricted-offchain-reference"
}
```

**Response**

```json
{
  "alert_id": "ALERT-random-id",
  "state": "ACTION_COMMITTED",
  "responder_wallet": "0x...",
  "response_deadline": "2026-09-29T11:00:00Z",
  "chain_tx_ref": "0x..."
}
```

The contract records only a coarse commitment code and deadline. Assignment identity, exact location, tactical plan, and operational notes remain off-chain.

### Resolve or dispute alert

**Resolve request**

```json
{
  "alert_id": "ALERT-random-id",
  "resolution_code": "REVIEW_COMPLETED",
  "outcome_ref": "restricted-offchain-reference"
}
```

**Dispute request**

```json
{
  "alert_id": "ALERT-random-id",
  "dispute_code": "DATA_QUALITY_CONCERN",
  "dispute_ref": "restricted-offchain-reference"
}
```

**Response**

```json
{
  "alert_id": "ALERT-random-id",
  "state": "RESOLVED",
  "resolution_code": "REVIEW_COMPLETED",
  "actor_wallet": "0x...",
  "occurred_at": "2026-09-29T11:05:00Z",
  "chain_tx_ref": "0x..."
}
```

For a dispute, `state` is `DISPUTED` and response includes a coarse dispute code. Detailed rationale/evidence is returned only from the authorized off-chain service. Resolution from `DISPUTED` is permitted only by an authorized resolution role; unresolved disputed alerts may expire under the lifecycle rules.
