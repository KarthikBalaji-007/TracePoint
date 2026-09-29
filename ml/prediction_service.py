"""Historical/live prediction orchestration and deterministic risk fusion."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path

import joblib

from ml import train_baseline
from ml.live_risk import HORIZONS, calculate_live_risk
from ml.live_risk_config import DEFAULT_LIVE_RISK_CONFIG
from ml.prediction_config import DEFAULT_FUSION_CONFIG

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
ZONE_CATALOGUE = Path(__file__).resolve().parent / "data" / "zones.json"
HORIZON_HOURS = {"+2h": 2, "+6h": 6, "+24h": 24}
SCORE_SEMANTICS = "RELATIVE_RISK_INDEX"


def parse_as_of(value):
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError) as exc:
            raise ValueError("as_of must be an RFC3339 timestamp with timezone") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("as_of must be an RFC3339 timestamp with timezone")
    return parsed.astimezone(timezone.utc)


def format_time(value):
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def load_historical_model(artifact_dir=ARTIFACT_DIR):
    """Load and strictly validate the registered Gradient Boosting artifacts."""
    artifact_dir = Path(artifact_dir)
    metadata = json.loads((artifact_dir / "model_metadata.json").read_text(encoding="utf-8"))
    saved_features = json.loads((artifact_dir / "feature_list.json").read_text(encoding="utf-8"))
    expected = train_baseline.FEATURE_LIST
    if metadata.get("selected_model") != "Gradient Boosting":
        raise ValueError("registered model is not Gradient Boosting")
    if metadata.get("score_semantics") != "UNCALIBRATED_RAW_MODEL_SCORE":
        raise ValueError("unexpected historical score semantics")
    if metadata.get("feature_list") != expected:
        raise ValueError("model metadata feature contract mismatch")
    if saved_features.get("numeric") != train_baseline.NUMERIC_FEATURES:
        raise ValueError("numeric preprocessing contract mismatch")
    if saved_features.get("categorical") != train_baseline.CATEGORICAL_FEATURES:
        raise ValueError("categorical preprocessing contract mismatch")
    model = joblib.load(artifact_dir / "model.joblib")
    preprocessor = joblib.load(artifact_dir / "preprocessor.joblib")
    if model.__class__.__name__ != "GradientBoostingClassifier":
        raise ValueError("model artifact class does not match registered Gradient Boosting model")
    if getattr(preprocessor, "n_features_in_", None) != len(expected):
        raise ValueError("saved preprocessor input width does not match feature contract")
    return HistoricalScorer(model, preprocessor, metadata)


class HistoricalScorer:
    def __init__(self, model, preprocessor, metadata):
        self.model = model
        self.preprocessor = preprocessor
        self.metadata = metadata

    def features_for(self, zone, events, as_of):
        cutoff = parse_as_of(as_of)
        start = cutoff - timedelta(hours=24)
        available = []
        for event in events:
            if event.get("status", "ACCEPTED") != "ACCEPTED" or event.get("zone_id") != zone["zone_id"]:
                continue
            try:
                event_time = parse_as_of(event["event_time"])
                received_at = parse_as_of(event["received_at"])
            except (KeyError, ValueError):
                continue
            if start <= event_time <= cutoff and received_at <= cutoff:
                available.append(event)
        signals = [item for item in available if item.get("event_type") in {"COMPLAINT", "TRANSACTION_SIGNAL"}]
        counts = lambda field, choices: {value: sum(event.get(field) == value for event in signals) for value in choices}
        hour, weekday = cutoff.hour, cutoff.weekday()
        features = {
            "recent_event_count_24h": len(available),
            "distinct_event_count_24h": len({
                (event.get("source_scope", "unknown"), event.get("source_event_id") or event.get("event_id"))
                for event in available
            }),
            "recent_cashout_count_24h": sum(event.get("event_type") == "CASHOUT_OBSERVED" for event in available),
            "cash_point_density": zone.get("cash_point_density") or 0,
            "hour_of_day": hour,
            "day_of_week": weekday,
            "is_weekend": weekday >= 5,
            "sin_hour": round(math.sin(2 * math.pi * hour / 24), 6),
            "cos_hour": round(math.cos(2 * math.pi * hour / 24), 6),
            "sin_day": round(math.sin(2 * math.pi * weekday / 7), 6),
            "cos_day": round(math.cos(2 * math.pi * weekday / 7), 6),
            "amount_band_counts_24h": counts("amount_band", train_baseline.AMOUNT_BANDS),
            "channel_counts_24h": counts("channel", train_baseline.CHANNELS),
            "category_counts_24h": counts("category", train_baseline.CATEGORIES),
        }
        return features, available

    def score(self, zone, events, as_of, horizon):
        if horizon not in HORIZONS:
            raise ValueError(f"unsupported horizon: {horizon}")
        features, available = self.features_for(zone, events, as_of)
        example = {"features": features, "zone_id": zone["zone_id"], "horizon": horizon}
        row = train_baseline._feature_values(example)
        transformed = self.preprocessor.transform([row])
        score = float(self.model.predict_proba(transformed)[0, 1])
        if not 0 <= score <= 1:
            raise ValueError("historical model returned a score outside [0,1]")
        provenance = {event.get("provenance") for event in available if event.get("provenance")}
        provenance.update(self.metadata.get("training_data_provenance", []))
        return {
            "score": score,
            "features": features,
            "feature_as_of": format_time(parse_as_of(as_of)),
            "event_refs": sorted(event.get("event_id") for event in available if event.get("event_id")),
            "provenance": provenance,
        }


def _risk_band(score, config):
    for band, threshold in config.risk_band_thresholds:
        if score >= threshold:
            return band
    return None


def _canonical_hash(value):
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class PredictionService:
    def __init__(
        self,
        historical_scorer=None,
        fusion_config=DEFAULT_FUSION_CONFIG,
        live_config=DEFAULT_LIVE_RISK_CONFIG,
    ):
        self.historical = historical_scorer or load_historical_model()
        self.fusion_config = fusion_config
        self.live_config = live_config

    def predict(self, jurisdiction_id, zones, events, live_features, as_of, zone_ids=None, horizons=None):
        cutoff = parse_as_of(as_of)
        chosen_horizons = list(horizons or HORIZONS)
        if not chosen_horizons or any(item not in HORIZONS for item in chosen_horizons):
            raise ValueError("horizons must be a non-empty subset of +2h, +6h, +24h")
        if len(set(chosen_horizons)) != len(chosen_horizons):
            raise ValueError("horizons must not contain duplicates")
        candidates = [
            zone for zone in zones
            if zone.get("active", True)
            and zone.get("jurisdiction_id") == jurisdiction_id
            and (zone_ids is None or zone.get("zone_id") in set(zone_ids))
        ]
        candidates.sort(key=lambda item: item["zone_id"])
        if zone_ids is not None and {item for item in zone_ids} - {zone["zone_id"] for zone in candidates}:
            raise ValueError("one or more requested zone_ids are not active in the jurisdiction")
        live_rows = calculate_live_risk(live_features, zones, cutoff, self.live_config)
        live_by_key = {(item["zone_id"], item["horizon"]): item for item in live_rows}
        predictions = []
        for zone in candidates:
            for horizon in chosen_horizons:
                historical = self.historical.score(zone, events, cutoff, horizon)
                live = live_by_key.get((zone["zone_id"], horizon))
                live_score = live["live_score_l"] if live else None
                historical_score = historical["score"]
                weight_h, weight_l = self.fusion_config.weights_for(horizon)
                missing = []
                if historical_score is None:
                    missing.append("HISTORICAL_SCORE_UNAVAILABLE")
                if live_score is None:
                    missing.append("LIVE_SCORE_UNAVAILABLE")
                fused = None
                if not missing:
                    fused = weight_h * historical_score + weight_l * live_score
                    if not 0 <= fused <= 1:
                        raise ValueError("fused score outside [0,1]")
                    fused = round(fused, 8)
                live_quality = live["data_quality"] if live else {"state": "NO_DATA", "live_data_exists": False}
                provenance = set(historical["provenance"])
                provenance.update(live_quality.get("provenance", []))
                if zone.get("source_class"):
                    provenance.add(zone["source_class"])
                provenance = sorted(provenance)
                synthetic_only = bool(provenance) and set(provenance).issubset({"SYNTHETIC", "MANUAL_DEMO"})
                quality_gate = "PASS" if not missing and live_quality.get("state") in {"CURRENT", "PROPAGATED"} else "FAIL"
                if quality_gate == "FAIL" and "LIVE_SCORE_UNAVAILABLE" not in missing:
                    missing.append("LIVE_QUALITY_GATE_FAILED")
                explanation = {
                    "historical": {
                        "score": round(historical_score, 8),
                        "weight": weight_h,
                        "contribution": round(weight_h * historical_score, 8),
                        "score_semantics": self.historical.metadata["score_semantics"],
                        "feature_event_count": len(historical["event_refs"]),
                    },
                    "live": {
                        "score": live_score,
                        "weight": weight_l,
                        "contribution": round(weight_l * live_score, 8) if live_score is not None else None,
                        "ruleset_version": live["live_ruleset_version"] if live else self.live_config.ruleset_version,
                        "indicators": {},
                        "freshness": live_quality.get("state"),
                    },
                    "weights": {"historical": weight_h, "live": weight_l},
                }
                # Keep a compact feature summary in the response, not event-level references.
                local_feature = next((item for item in (live_features.get("zones", []) if isinstance(live_features, dict) else live_features or []) if item.get("zone_id") == zone["zone_id"]), {})
                explanation["live"]["indicators"] = {
                    "recent_event_count": local_feature.get("recent_event_count", 0),
                    "distinct_event_count": local_feature.get("distinct_event_count", 0),
                    "amount_band_counts": local_feature.get("amount_band_counts", {}),
                    "zone_has_recent_data": live_quality.get("zone_has_recent_data", False),
                }
                window_end = cutoff + timedelta(hours=HORIZON_HOURS[horizon])
                predictions.append({
                    "zone_id": zone["zone_id"],
                    "horizon": horizon,
                    "as_of": format_time(cutoff),
                    "window_start": format_time(cutoff),
                    "window_end": format_time(window_end),
                    "historical_score_h": round(historical_score, 8),
                    "live_score_l": live_score,
                    "fused_score_f": fused,
                    "rank": None,
                    "risk_band": _risk_band(fused, self.fusion_config) if fused is not None else None,
                    "score_semantics": SCORE_SEMANTICS,
                    "model_version": self.historical.metadata["model_version"],
                    "fusion_version": self.fusion_config.fusion_version,
                    "risk_band_version": self.fusion_config.band_version,
                    "source_provenance": provenance,
                    "synthetic_only": synthetic_only,
                    "feature_as_of": historical["feature_as_of"],
                    "last_event_at": live.get("last_event_at") if live else None,
                    "data_quality": {
                        "quality_gate": quality_gate,
                        "freshness": live_quality.get("state", "NO_DATA"),
                        "live_data_exists": live_quality.get("live_data_exists", False),
                        "missing_components": missing,
                        "coverage": "SYNTHETIC_DEMO" if synthetic_only else "MIXED_OR_AUTHORIZED",
                        "excluded_future_snapshot_count": live_quality.get("excluded_future_snapshot_count", 0),
                    },
                    "uncertainty": None,
                    "explanation": explanation,
                    "_event_refs": historical["event_refs"],
                })

        for horizon in chosen_horizons:
            valid = sorted(
                (row for row in predictions if row["horizon"] == horizon and row["fused_score_f"] is not None),
                key=lambda item: (-item["fused_score_f"], item["zone_id"]),
            )
            for rank, row in enumerate(valid, start=1):
                row["rank"] = rank

        snapshot_hash = _canonical_hash({
            "jurisdiction_id": jurisdiction_id,
            "zone_ids": [zone["zone_id"] for zone in candidates],
            "horizons": chosen_horizons,
            "as_of": format_time(cutoff),
            "model_version": self.historical.metadata["model_version"],
            "fusion_version": self.fusion_config.fusion_version,
            "risk_band_version": self.fusion_config.band_version,
            "live_ruleset_version": self.live_config.ruleset_version,
            "predictions": predictions,
        })
        snapshot_id = f"PREDSET-{snapshot_hash[:24]}"
        for row in predictions:
            row["prediction_id"] = f"PRED-{_canonical_hash([snapshot_id, row['zone_id'], row['horizon']])[:24]}"
            row.pop("_event_refs", None)
        return {"snapshot_id": snapshot_id, "as_of": format_time(cutoff), "predictions": predictions}
