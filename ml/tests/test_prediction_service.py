from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from uuid import uuid4

import pytest

from ml.live_risk import calculate_live_risk
from ml.prediction_config import DEFAULT_FUSION_CONFIG
from ml.prediction_service import PredictionService, _risk_band, load_historical_model


AS_OF = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def scorer():
    return load_historical_model()


@pytest.fixture
def zones():
    return [
        {"zone_id": "DEMO-A", "jurisdiction_id": "DEMO-JUR", "cash_point_density": 20, "source_class": "SYNTHETIC", "centroid": {"lat": 28.6, "lon": 77.2}, "active": True},
        {"zone_id": "DEMO-B", "jurisdiction_id": "DEMO-JUR", "cash_point_density": 20, "source_class": "SYNTHETIC", "centroid": {"lat": 28.61, "lon": 77.2}, "active": True},
    ]


def event(zone_id="DEMO-A", **overrides):
    at = AS_OF - timedelta(minutes=5)
    item = {
        "event_id": "SYN-1", "source_event_id": "SYN-1", "source_scope": "demo",
        "event_type": "TRANSACTION_SIGNAL", "event_time": at.isoformat(),
        "received_at": (at + timedelta(seconds=10)).isoformat(),
        "zone_id": zone_id, "jurisdiction_id": "DEMO-JUR", "amount_band": "BAND_4",
        "channel": "UPI", "category": "QR_FRAUD", "provenance": "SYNTHETIC", "status": "ACCEPTED",
    }
    return item | overrides


def live_row(zone_id, as_of=AS_OF, count=1, event_time=None):
    last = event_time or (as_of - timedelta(minutes=5))
    return {
        "zone_id": zone_id, "recent_event_count": count, "distinct_event_count": count,
        "amount_band_counts": {"BAND_4": count}, "provenance_counts": {"SYNTHETIC": count},
        "last_event_at": last.isoformat().replace("+00:00", "Z"),
        "has_recent_data": count > 0, "as_of": as_of.isoformat().replace("+00:00", "Z"),
    }


def predict(scorer, zones, events, live):
    return PredictionService(historical_scorer=scorer).predict(
        "DEMO-JUR", zones, events, {"zones": live}, AS_OF, horizons=["+2h", "+6h", "+24h"]
    )


def row_for(result, zone_id, horizon="+2h"):
    return next(row for row in result["predictions"] if row["zone_id"] == zone_id and row["horizon"] == horizon)


def test_registered_gradient_boosting_artifacts_load(scorer):
    assert scorer.metadata["selected_model"] == "Gradient Boosting"
    assert scorer.metadata["model_version"].startswith("tracepoint-historical-baseline-v1")
    assert scorer.metadata["score_semantics"] == "UNCALIBRATED_RAW_MODEL_SCORE"


def test_historical_scores_are_generated_and_raw(scorer, zones):
    result = scorer.score(zones[0], [event()], AS_OF, "+2h")
    assert 0 <= result["score"] <= 1
    assert result["features"]["recent_event_count_24h"] == 1
    assert result["feature_as_of"] == "2026-09-01T12:00:00Z"


def test_future_event_and_late_received_event_do_not_leak(scorer, zones):
    future = event(event_time=(AS_OF + timedelta(minutes=1)).isoformat(), received_at=(AS_OF + timedelta(minutes=2)).isoformat())
    late = event("DEMO-A", event_id="SYN-LATE", event_time=(AS_OF - timedelta(minutes=2)).isoformat(), received_at=(AS_OF + timedelta(seconds=1)).isoformat())
    features, used = scorer.features_for(zones[0], [future, late], AS_OF)
    assert features["recent_event_count_24h"] == 0
    assert used == []


def test_live_score_is_reused_and_fusion_is_exact(scorer, zones):
    live = [live_row("DEMO-A"), live_row("DEMO-B", count=0)]
    result = predict(scorer, zones, [event()], live)
    prediction = row_for(result, "DEMO-A")
    expected_live = next(item for item in calculate_live_risk({"zones": live}, zones, AS_OF) if item["zone_id"] == "DEMO-A" and item["horizon"] == "+2h")
    assert prediction["live_score_l"] == expected_live["live_score_l"]
    weights = DEFAULT_FUSION_CONFIG.weights_for("+2h")
    expected = weights[0] * prediction["historical_score_h"] + weights[1] * prediction["live_score_l"]
    assert prediction["fused_score_f"] == pytest.approx(expected, abs=1e-8)


def test_horizon_weights_and_versions_are_preserved(scorer, zones):
    result = predict(scorer, zones, [event()], [live_row("DEMO-A"), live_row("DEMO-B", count=0)])
    for horizon in ("+2h", "+6h", "+24h"):
        pred = row_for(result, "DEMO-A", horizon)
        assert pred["explanation"]["weights"]["historical"] == DEFAULT_FUSION_CONFIG.weights_for(horizon)[0]
        assert pred["fusion_version"] == DEFAULT_FUSION_CONFIG.fusion_version


def test_missing_live_component_leaves_fusion_and_rank_null(scorer, zones):
    result = predict(scorer, zones, [], [])
    item = row_for(result, "DEMO-A")
    assert item["historical_score_h"] is not None
    assert item["live_score_l"] is None
    assert item["fused_score_f"] is None
    assert item["rank"] is None
    assert "LIVE_SCORE_UNAVAILABLE" in item["data_quality"]["missing_components"]


def test_ranking_excludes_invalid_rows_and_assigns_bands(scorer, zones):
    no_centroid_zones = [zones[0], zones[1] | {"centroid": None}]
    result = predict(scorer, no_centroid_zones, [], [live_row("DEMO-A"), live_row("DEMO-B", count=0)])
    assert row_for(result, "DEMO-A")["rank"] == 1
    assert row_for(result, "DEMO-B")["rank"] is None
    assert _risk_band(0.8, DEFAULT_FUSION_CONFIG) == "CRITICAL"
    assert _risk_band(0.6, DEFAULT_FUSION_CONFIG) == "HIGH"
    assert _risk_band(0.3, DEFAULT_FUSION_CONFIG) == "MEDIUM"
    assert _risk_band(0.1, DEFAULT_FUSION_CONFIG) == "LOW"


def test_provenance_semantics_and_snapshot_are_deterministic(scorer, zones):
    live = [live_row("DEMO-A"), live_row("DEMO-B", count=0)]
    first = predict(scorer, zones, [event()], live)
    second = predict(scorer, zones, [event()], live)
    pred = row_for(first, "DEMO-A")
    assert first == second
    assert first["snapshot_id"] == second["snapshot_id"]
    assert pred["source_provenance"] == ["SYNTHETIC"]
    assert pred["synthetic_only"] is True
    assert pred["score_semantics"] == "RELATIVE_RISK_INDEX"
    assert pred["explanation"]["historical"]["score_semantics"] == "UNCALIBRATED_RAW_MODEL_SCORE"


def test_service_rejects_feature_contract_mismatch(monkeypatch):
    original_read_text = Path.read_text

    def altered_metadata(path, *args, **kwargs):
        content = original_read_text(path, *args, **kwargs)
        if path.name == "model_metadata.json" and path.parent.name == "artifacts":
            metadata = json.loads(content)
            metadata["feature_list"] = ["wrong"]
            return json.dumps(metadata)
        return content

    monkeypatch.setattr(Path, "read_text", altered_metadata)
    with pytest.raises(ValueError, match="feature contract"):
        load_historical_model()
