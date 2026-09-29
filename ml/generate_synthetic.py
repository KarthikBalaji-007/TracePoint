"""Generate reproducible synthetic zones, events, and historical examples."""

import argparse
import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path


PROVENANCE = "SYNTHETIC"
HORIZONS = {"+2h": 2, "+6h": 6, "+24h": 24}
AMOUNT_BANDS = ("BAND_1", "BAND_2", "BAND_3", "BAND_4")
CHANNELS = ("UPI", "AEPS", "CARD", "NET_BANKING")
CATEGORIES = ("PHISHING", "QR_FRAUD", "IMPERSONATION", "INVESTMENT_SCAM")
FEATURE_FIELDS = {
    "recent_event_count_24h",
    "distinct_event_count_24h",
    "recent_cashout_count_24h",
    "cash_point_density",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "sin_hour",
    "cos_hour",
    "sin_day",
    "cos_day",
    "amount_band_counts_24h",
    "channel_counts_24h",
    "category_counts_24h",
}
DEFAULT_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
REGION_CENTERS = (
    ("SYN-NORTH", 29.0, 78.0),
    ("SYN-WEST", 22.0, 73.0),
    ("SYN-SOUTH", 14.0, 77.0),
    ("SYN-EAST", 24.0, 85.0),
)


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.utcoffset() is None:
        raise ValueError("timestamps must include a timezone")
    return parsed.astimezone(timezone.utc)


def weighted_choice(rng: random.Random, values, weights):
    return rng.choices(values, weights=weights, k=1)[0]


def generate_zones(num_zones: int, rng: random.Random, start_at: datetime) -> list[dict]:
    if num_zones < 1:
        raise ValueError("num_zones must be at least 1")

    densities = [5 + round(index * 55 / max(1, num_zones - 1)) for index in range(num_zones)]
    rng.shuffle(densities)
    zones = []
    for index in range(num_zones):
        region, center_lat, center_lon = REGION_CENTERS[index % len(REGION_CENTERS)]
        zone_id = f"SYN-ZONE-{index + 1:03d}"
        zones.append(
            {
                "zone_id": zone_id,
                "jurisdiction_id": f"SYN-JUR-{index % max(1, min(num_zones, 4)) + 1:02d}",
                "label": f"Synthetic Zone {index + 1:03d}",
                "centroid": {
                    "lat": round(center_lat + rng.uniform(-0.35, 0.35), 5),
                    "lon": round(center_lon + rng.uniform(-0.4, 0.4), 5),
                },
                "cash_point_density": densities[index],
                "source_class": PROVENANCE,
                "active": True,
                "created_at": iso_utc(start_at),
            }
        )
    return zones


def _signal_time(rng: random.Random, start_at: datetime, days: int) -> datetime:
    day_weights = [1.15 if (start_at + timedelta(days=day)).weekday() >= 5 else 1.0 for day in range(days)]
    day = weighted_choice(rng, range(days), day_weights)
    hour_weights = [1.0] * 24
    for hour in range(10, 15):
        hour_weights[hour] = 1.45
    for hour in range(19, 24):
        hour_weights[hour] = 1.65
    for hour in (0, 1, 2, 3, 4):
        hour_weights[hour] = 1.2
    hour = weighted_choice(rng, range(24), hour_weights)
    return start_at + timedelta(
        days=day,
        hours=hour,
        minutes=rng.randrange(60),
        seconds=rng.randrange(60),
    )


def _cashout_probability(signal: dict, zone: dict) -> float:
    hour = parse_timestamp(signal["event_time"]).hour
    score = 0.10 + zone["cash_point_density"] / 180
    if hour >= 20 or hour <= 4:
        score += 0.12
    if signal["channel"] in ("UPI", "AEPS"):
        score += 0.09
    if signal["amount_band"] == "BAND_4":
        score += 0.10
    if signal["category"] in ("QR_FRAUD", "INVESTMENT_SCAM"):
        score += 0.05
    return min(0.82, max(0.04, score))


def generate_events(
    zones: list[dict], num_events: int, days: int, rng: random.Random, start_at: datetime
) -> list[dict]:
    if num_events < 0:
        raise ValueError("num_events cannot be negative")
    if days < 3:
        raise ValueError("days must be at least 3 to support the +24h horizon")

    signals = []
    outcomes = []
    zone_weights = [zone["cash_point_density"] ** 0.8 for zone in zones]
    report_delays = (5, 15, 30, 60, 180, 360)
    report_weights = (0.16, 0.20, 0.20, 0.19, 0.17, 0.08)
    for index in range(num_events):
        zone = weighted_choice(rng, zones, zone_weights)
        event_time = _signal_time(rng, start_at, days)
        centroid = zone["centroid"]
        event_id = f"SYN-EVT-{index + 1:07d}"
        event_type = weighted_choice(rng, ("COMPLAINT", "TRANSACTION_SIGNAL"), (0.38, 0.62))
        amount_band = weighted_choice(rng, AMOUNT_BANDS, (0.36, 0.34, 0.21, 0.09))
        channel = weighted_choice(rng, CHANNELS, (0.56, 0.17, 0.16, 0.11))
        category = weighted_choice(rng, CATEGORIES, (0.35, 0.25, 0.24, 0.16))
        signal = {
            "event_id": event_id,
            "source_event_id": event_id,
            "event_type": event_type,
            "event_time": iso_utc(event_time),
            "received_at": iso_utc(
                event_time + timedelta(minutes=weighted_choice(rng, report_delays, report_weights))
            ),
            "jurisdiction_id": zone["jurisdiction_id"],
            "zone_id": zone["zone_id"],
            "location": {
                "lat": round(centroid["lat"] + rng.uniform(-0.01, 0.01), 5),
                "lon": round(centroid["lon"] + rng.uniform(-0.01, 0.01), 5),
            },
            "amount_band": amount_band,
            "channel": channel,
            "category": category,
            "correlation_ref": f"SYN-CASE-{index + 1:07d}",
            "provenance": PROVENANCE,
            "source_ref": "synthetic-generator",
            "source_scope": "synthetic-generator",
            "idempotency_key": event_id,
            "quality": {"validation": "PASSED", "source_confidence": "SIMULATED"},
            "status": "ACCEPTED",
        }
        signals.append(signal)

        if rng.random() < _cashout_probability(signal, zone):
            outcome_time = event_time + timedelta(minutes=rng.randint(8, 210))
            outcome_id = f"SYN-OUT-{index + 1:07d}"
            outcomes.append(
                {
                    "event_id": outcome_id,
                    "source_event_id": outcome_id,
                    "event_type": "CASHOUT_OBSERVED",
                    "event_time": iso_utc(outcome_time),
                    "received_at": iso_utc(outcome_time + timedelta(seconds=rng.randint(20, 180))),
                    "jurisdiction_id": zone["jurisdiction_id"],
                    "zone_id": zone["zone_id"],
                    "location": None,
                    "amount_band": amount_band,
                    "channel": channel,
                    "category": category,
                    "correlation_ref": signal["correlation_ref"],
                    "related_event_id": event_id,
                    "provenance": PROVENANCE,
                    "source_ref": "synthetic-generator-outcome",
                    "source_scope": "synthetic-generator",
                    "idempotency_key": outcome_id,
                    "quality": {"validation": "PASSED", "source_confidence": "SIMULATED"},
                    "status": "ACCEPTED",
                }
            )

    return sorted(signals + outcomes, key=lambda item: (item["event_time"], item["received_at"], item["event_id"]))


def _counts(values, allowed):
    result = {key: 0 for key in allowed}
    for value in values:
        if value in result:
            result[value] += 1
    return result


def build_training_examples(
    zones: list[dict], events: list[dict], days: int, start_at: datetime, step_hours: int = 6
) -> list[dict]:
    if step_hours < 1:
        raise ValueError("step_hours must be positive")
    zone_by_id = {zone["zone_id"]: zone for zone in zones}
    events_by_zone = {zone_id: [] for zone_id in zone_by_id}
    for event in events:
        if event["zone_id"] in events_by_zone:
            events_by_zone[event["zone_id"]].append(event)

    data_end = start_at + timedelta(days=days)
    first_cutoff = start_at + timedelta(hours=24)
    last_cutoff = data_end - timedelta(hours=max(HORIZONS.values()))
    examples = []
    cutoff = first_cutoff
    cutoff_index = 0
    while cutoff <= last_cutoff:
        cutoff_text = iso_utc(cutoff)
        for zone in zones:
            zone_events = events_by_zone[zone["zone_id"]]
            feature_events = [
                event for event in zone_events
                if cutoff - timedelta(hours=24) <= parse_timestamp(event["event_time"]) <= cutoff
                and parse_timestamp(event["received_at"]) <= cutoff
            ]
            signal_events = [
                event for event in feature_events
                if event["event_type"] in ("COMPLAINT", "TRANSACTION_SIGNAL")
            ]
            outcomes = [event for event in zone_events if event["event_type"] == "CASHOUT_OBSERVED"]
            event_times = [event["event_time"] for event in feature_events]
            received_times = [event["received_at"] for event in feature_events]
            hour = cutoff.hour
            day_of_week = cutoff.weekday()
            features = {
                "recent_event_count_24h": len(feature_events),
                "distinct_event_count_24h": len({
                    (event["source_scope"], event.get("source_event_id") or event["event_id"])
                    for event in feature_events
                }),
                "recent_cashout_count_24h": sum(
                    event["event_type"] == "CASHOUT_OBSERVED" for event in feature_events
                ),
                "cash_point_density": zone["cash_point_density"],
                "hour_of_day": hour,
                "day_of_week": day_of_week,
                "is_weekend": day_of_week >= 5,
                "sin_hour": round(math.sin(2 * math.pi * hour / 24), 6),
                "cos_hour": round(math.cos(2 * math.pi * hour / 24), 6),
                "sin_day": round(math.sin(2 * math.pi * day_of_week / 7), 6),
                "cos_day": round(math.cos(2 * math.pi * day_of_week / 7), 6),
                "amount_band_counts_24h": _counts(
                    [event["amount_band"] for event in signal_events], AMOUNT_BANDS
                ),
                "channel_counts_24h": _counts(
                    [event["channel"] for event in signal_events], CHANNELS
                ),
                "category_counts_24h": _counts(
                    [event["category"] for event in signal_events], CATEGORIES
                ),
            }
            for horizon, hours in HORIZONS.items():
                window_end = cutoff + timedelta(hours=hours)
                target_events = [
                    event for event in outcomes
                    if cutoff < parse_timestamp(event["event_time"]) <= window_end
                ]
                examples.append(
                    {
                        "example_id": f"SYN-EX-{cutoff_index:05d}-{zone['zone_id']}-{hours:02d}",
                        "zone_id": zone["zone_id"],
                        "as_of": cutoff_text,
                        "horizon": horizon,
                        "horizon_hours": hours,
                        "features": features,
                        "feature_event_refs": [event["event_id"] for event in feature_events],
                        "feature_event_times": event_times,
                        "feature_received_times": received_times,
                        "latest_feature_event_time": max(event_times, default=None),
                        "latest_feature_available_at": max(received_times, default=None),
                        "target_cashout_in_window": int(bool(target_events)),
                        "label_window_start": cutoff_text,
                        "label_window_end": iso_utc(window_end),
                        "target_event_refs": [event["event_id"] for event in target_events],
                        "provenance": PROVENANCE,
                    }
                )
        cutoff += timedelta(hours=step_hours)
        cutoff_index += 1
    return examples


def validate_training_examples(examples: list[dict], events: list[dict]) -> None:
    """Assert feature timestamps are available by cutoff and labels are future-only."""
    events_by_id = {event["event_id"]: event for event in events}
    for example in examples:
        as_of = parse_timestamp(example["as_of"])
        if set(example["features"]) != FEATURE_FIELDS:
            raise ValueError(f"unexpected feature fields in {example['example_id']}")
        for timestamp in example["feature_event_times"]:
            if parse_timestamp(timestamp) > as_of:
                raise ValueError(f"feature event occurs after as_of in {example['example_id']}")
        for timestamp in example["feature_received_times"]:
            if parse_timestamp(timestamp) > as_of:
                raise ValueError(f"feature was unavailable at as_of in {example['example_id']}")
        for event_id in example["feature_event_refs"]:
            event = events_by_id[event_id]
            if event["event_type"] == "CASHOUT_OBSERVED" and parse_timestamp(event["event_time"]) > as_of:
                raise ValueError(f"future outcome leaked into features in {example['example_id']}")
        label_end = parse_timestamp(example["label_window_end"])
        for event_id in example["target_event_refs"]:
            event = events_by_id[event_id]
            outcome_time = parse_timestamp(event["event_time"])
            if not as_of < outcome_time <= label_end:
                raise ValueError(f"label event outside future window in {example['example_id']}")
        if example["target_cashout_in_window"] != int(bool(example["target_event_refs"])):
            raise ValueError(f"target does not match label events in {example['example_id']}")


def generate_dataset(
    num_zones: int = 8,
    num_events: int = 400,
    seed: int = 42,
    days: int = 30,
    step_hours: int = 6,
    start_at: datetime = DEFAULT_START,
) -> dict:
    if start_at.utcoffset() is None:
        raise ValueError("start_at must be timezone-aware")
    rng = random.Random(seed)
    zones = generate_zones(num_zones, rng, start_at)
    events = generate_events(zones, num_events, days, rng, start_at)
    examples = build_training_examples(zones, events, days, start_at, step_hours)
    validate_training_examples(examples, events)
    return {
        "zones": zones,
        "events": events,
        "training_examples": examples,
        "seed": seed,
        "days": days,
    }


def write_dataset(dataset: dict, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "zones.json").write_text(
        json.dumps(dataset["zones"], indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    for key, filename in (
        ("events", "events.jsonl"),
        ("training_examples", "training_examples.jsonl"),
    ):
        with (output_dir / filename).open("w", encoding="utf-8", newline="\n") as stream:
            for row in dataset[key]:
                stream.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zones", type=int, default=8, help="number of synthetic zones")
    parser.add_argument("--events", type=int, default=400, help="number of complaint/transaction signals")
    parser.add_argument("--seed", type=int, default=42, help="fixed random seed")
    parser.add_argument("--days", type=int, default=30, help="synthetic observation period")
    parser.add_argument("--step-hours", type=int, default=6, help="hours between example cutoffs")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "data",
        help="directory for zones.json, events.jsonl, and training_examples.jsonl",
    )
    args = parser.parse_args()
    dataset = generate_dataset(args.zones, args.events, args.seed, args.days, args.step_hours)
    write_dataset(dataset, args.output_dir)
    print(
        f"Wrote {len(dataset['zones'])} zones, {len(dataset['events'])} events, "
        f"and {len(dataset['training_examples'])} training examples to {args.output_dir} "
        f"(seed={args.seed}, provenance={PROVENANCE})."
    )


if __name__ == "__main__":
    main()
