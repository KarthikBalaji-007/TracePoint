"""Deterministic zone-level live risk index from backend rolling features.

Scores are relative prioritization indices, never probabilities or calibrated risks.
"""

from datetime import datetime, timezone
import math

from ml.live_risk_config import DEFAULT_LIVE_RISK_CONFIG

HORIZONS = ("+2h", "+6h", "+24h")


def _parse_time(value):
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _time_text(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _saturate(value, scale):
    return min(1.0, max(0.0, value) / scale)


def _haversine_km(a, b):
    lat1, lon1 = math.radians(a["lat"]), math.radians(a["lon"])
    lat2, lon2 = math.radians(b["lat"]), math.radians(b["lon"])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    hav = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(hav)))


def _zones_by_id(zones):
    if isinstance(zones, dict):
        zones = zones.get("zones", zones)
        if isinstance(zones, dict):
            zones = [dict(value, zone_id=key) for key, value in zones.items()]
    return {zone["zone_id"]: zone for zone in zones}


def _features_by_id(live_features):
    if isinstance(live_features, dict):
        rows = live_features.get("zones", [])
    else:
        rows = live_features or []
    return {row["zone_id"]: row for row in rows if row.get("zone_id")}


def _activity(row, event_time, as_of, config):
    count = max(0, int(row.get("recent_event_count") or 0))
    distinct = max(0, int(row.get("distinct_event_count") or 0))
    bands = row.get("amount_band_counts") or {}
    amount_weighted = sum(
        max(0, int(bands.get(band) or 0)) * weight
        for band, weight in config.amount_band_weights
    )
    age_minutes = max(0.0, (as_of - event_time).total_seconds() / 60.0)
    activity = (
        config.count_weight * _saturate(count, config.count_saturation)
        + config.distinct_weight * _saturate(distinct, config.distinct_saturation)
        + config.amount_weight * _saturate(amount_weighted, config.amount_saturation)
    )
    return activity * math.exp(-age_minutes / config.event_recency_tau_minutes)


def calculate_live_risk(live_features, zones, as_of, config=DEFAULT_LIVE_RISK_CONFIG):
    """Return a row for every candidate zone and horizon.

    ``live_features`` accepts the backend ``get_live_features`` response or its
    ``zones`` list. Ineligible/missing data yields ``live_score_l=None`` rather
    than a numeric zero-risk assertion.
    """
    cutoff = _parse_time(as_of)
    if cutoff is None:
        raise ValueError("as_of must be a timezone-aware RFC3339 timestamp")
    zone_map = _zones_by_id(zones)
    feature_map = _features_by_id(live_features)
    sources = []
    stored_timestamps = []
    excluded_future_snapshot = 0

    for zone_id, row in feature_map.items():
        last_event = _parse_time(row.get("last_event_at"))
        feature_as_of = _parse_time(row.get("as_of"))
        if feature_as_of and feature_as_of > cutoff:
            excluded_future_snapshot += 1
            continue
        if last_event and last_event <= cutoff:
            stored_timestamps.append(last_event)
        if not row.get("has_recent_data") or not last_event or last_event > cutoff:
            continue
        age = (cutoff - last_event).total_seconds() / 60.0
        if age > config.max_freshness_minutes:
            continue
        zone = zone_map.get(zone_id)
        centroid = zone.get("centroid") if zone else None
        if not centroid or "lat" not in centroid or "lon" not in centroid:
            continue
        local_signal = _activity(row, last_event, cutoff, config)
        if local_signal <= 0:
            continue
        provenance = row.get("provenance_counts") or {}
        sources.append({
            "zone_id": zone_id,
            "centroid": centroid,
            "last_event": last_event,
            "signal": local_signal,
            "provenance": provenance,
        })

    latest_stored = max(stored_timestamps) if stored_timestamps else None
    latest_age = max(0.0, (cutoff - latest_stored).total_seconds() / 60.0) if latest_stored else None
    output = []
    for zone_id in sorted(zone_map):
        zone = zone_map[zone_id]
        centroid = zone.get("centroid") or {}
        row = feature_map.get(zone_id, {})
        local_last = _parse_time(row.get("last_event_at"))
        local_recent = bool(row.get("has_recent_data")) and local_last is not None and local_last <= cutoff
        local_age = max(0.0, (cutoff - local_last).total_seconds() / 60.0) if local_last else None
        is_stale = bool(local_last and (local_age > config.max_freshness_minutes or not local_recent))

        contributions = []
        for source in sources:
            distance = _haversine_km(centroid, source["centroid"]) if "lat" in centroid and "lon" in centroid else None
            if distance is None:
                continue
            spatial_weight = math.exp(-distance / config.distance_decay_km)
            contributions.append((source, source["signal"] * spatial_weight))
        live_exists = bool(sources)
        freshest_influencing = max((source["last_event"] for source, _ in contributions), default=None)
        provenance = sorted({key for source, _ in contributions for key, value in source["provenance"].items() if value})
        zone_has_data = local_recent and local_age <= config.max_freshness_minutes
        if live_exists and contributions:
            state = "CURRENT" if zone_has_data else "PROPAGATED"
        elif is_stale or (latest_stored and not live_exists):
            state = "STALE"
        else:
            state = "NO_DATA"

        for horizon, horizon_factor in config.horizon_factors:
            if not live_exists or not contributions:
                score = None
            else:
                intensity = sum(value for _, value in contributions) * horizon_factor
                score = round(min(1.0, max(0.0, 1.0 - math.exp(-intensity))), 8)
            quality_state = state
            if excluded_future_snapshot and not live_exists:
                quality_state = "FEATURES_AFTER_AS_OF"
            output.append({
                "zone_id": zone_id,
                "horizon": horizon,
                "live_score_l": score,
                "last_event_at": _time_text(freshest_influencing) if freshest_influencing else None,
                "as_of": _time_text(cutoff),
                "data_quality": {
                    "state": quality_state,
                    "live_data_exists": live_exists,
                    "stored_data_exists": bool(latest_stored),
                    "zone_has_recent_data": bool(zone_has_data),
                    "freshness_age_minutes": round(latest_age, 2) if latest_age is not None else None,
                    "source_zone_count": len(sources),
                    "provenance": provenance,
                    "excluded_future_snapshot_count": excluded_future_snapshot,
                },
                "live_ruleset_version": config.ruleset_version,
            })
    return output
