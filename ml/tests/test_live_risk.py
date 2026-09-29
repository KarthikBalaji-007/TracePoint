from datetime import datetime, timedelta, timezone

from ml.live_risk import HORIZONS, calculate_live_risk
from ml.live_risk_config import DEFAULT_LIVE_RISK_CONFIG


AS_OF = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def zone(zone_id, lat, lon):
    return {"zone_id": zone_id, "centroid": {"lat": lat, "lon": lon}}


def feature(zone_id, as_of=AS_OF, event_age_minutes=5, count=4, distinct=3, bands=None):
    event_time = as_of - timedelta(minutes=event_age_minutes)
    return {
        "zone_id": zone_id,
        "recent_event_count": count,
        "distinct_event_count": distinct,
        "amount_band_counts": bands if bands is not None else {"BAND_1": 1, "BAND_3": 2},
        "provenance_counts": {"SYNTHETIC": count},
        "last_event_at": event_time.isoformat().replace("+00:00", "Z"),
        "latest_processed_at": (event_time + timedelta(seconds=2)).isoformat().replace("+00:00", "Z"),
        "has_recent_data": True,
        "as_of": as_of.isoformat().replace("+00:00", "Z"),
    }


def score_for(rows, zone_id, horizon="+2h"):
    return next(row for row in rows if row["zone_id"] == zone_id and row["horizon"] == horizon)


def test_no_events_are_explicitly_missing_not_zero_risk():
    rows = calculate_live_risk([], [zone("A", 28.6, 77.2)], AS_OF)
    assert len(rows) == len(HORIZONS)
    assert all(row["live_score_l"] is None for row in rows)
    assert all(row["data_quality"]["state"] == "NO_DATA" for row in rows)
    assert all(row["data_quality"]["live_data_exists"] is False for row in rows)


def test_recent_activity_increases_local_zone_score():
    zones = [zone("A", 28.6, 77.2)]
    empty = calculate_live_risk([], zones, AS_OF)
    active = calculate_live_risk([feature("A")], zones, AS_OF)
    assert score_for(empty, "A")["live_score_l"] is None
    assert score_for(active, "A")["live_score_l"] > 0


def test_older_activity_has_less_influence():
    zones = [zone("A", 28.6, 77.2)]
    recent = calculate_live_risk([feature("A", event_age_minutes=2)], zones, AS_OF)
    older = calculate_live_risk([feature("A", event_age_minutes=70)], zones, AS_OF)
    assert score_for(recent, "A")["live_score_l"] > score_for(older, "A")["live_score_l"]


def test_nearby_zone_gets_more_propagated_influence():
    zones = [zone("SOURCE", 28.600, 77.200), zone("NEAR", 28.605, 77.200), zone("FAR", 29.5, 77.2)]
    rows = calculate_live_risk([feature("SOURCE")], zones, AS_OF)
    assert score_for(rows, "NEAR")["live_score_l"] > score_for(rows, "FAR")["live_score_l"]
    assert score_for(rows, "NEAR")["data_quality"]["state"] == "PROPAGATED"


def test_horizon_decay_changes_scores():
    rows = calculate_live_risk([feature("A")], [zone("A", 28.6, 77.2)], AS_OF)
    scores = [score_for(rows, "A", horizon)["live_score_l"] for horizon in HORIZONS]
    assert scores[0] > scores[1] > scores[2]
    assert DEFAULT_LIVE_RISK_CONFIG.horizon_factors == (("+2h", 1.0), ("+6h", 0.78), ("+24h", 0.48))


def test_identical_inputs_are_deterministic():
    features = {"zones": [feature("A"), feature("B", event_age_minutes=15)]}
    zones = [zone("A", 28.6, 77.2), zone("B", 28.7, 77.3)]
    assert calculate_live_risk(features, zones, AS_OF) == calculate_live_risk(features, zones, AS_OF)


def test_scores_stay_in_unit_interval():
    rows = calculate_live_risk([feature("A", count=10000, distinct=10000)], [zone("A", 28.6, 77.2)], AS_OF)
    assert all(0.0 <= row["live_score_l"] <= 1.0 for row in rows)


def test_missing_live_data_is_not_converted_to_zero():
    rows = calculate_live_risk([], [zone("A", 28.6, 77.2), zone("B", 28.7, 77.3)], AS_OF)
    candidate = score_for(rows, "B")
    assert candidate["live_score_l"] is None
    assert candidate["data_quality"]["stored_data_exists"] is False
    assert candidate["data_quality"]["state"] == "NO_DATA"


def test_feature_snapshot_after_as_of_is_excluded():
    future_snapshot = feature("A", as_of=AS_OF + timedelta(minutes=1))
    rows = calculate_live_risk([future_snapshot], [zone("A", 28.6, 77.2)], AS_OF)
    result = score_for(rows, "A")
    assert result["live_score_l"] is None
    assert result["data_quality"]["state"] == "FEATURES_AFTER_AS_OF"
