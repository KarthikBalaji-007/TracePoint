from datetime import timezone

from ml.generate_synthetic import (
    DEFAULT_START,
    HORIZONS,
    generate_dataset,
    parse_timestamp,
    validate_training_examples,
)


def small_dataset(seed=123):
    return generate_dataset(num_zones=5, num_events=120, seed=seed, days=10, step_hours=6)


def test_generation_is_deterministic_for_same_seed():
    first = small_dataset()
    second = small_dataset()

    assert first == second


def test_generated_zones_and_events_preserve_synthetic_provenance():
    dataset = small_dataset()
    event_order = [
        (event["event_time"], event["received_at"], event["event_id"])
        for event in dataset["events"]
    ]

    assert len(dataset["zones"]) == 5
    assert all(zone["source_class"] == "SYNTHETIC" for zone in dataset["zones"])
    assert len({zone["cash_point_density"] for zone in dataset["zones"]}) > 1
    assert all(event["provenance"] == "SYNTHETIC" for event in dataset["events"])
    assert event_order == sorted(event_order)
    assert {event["event_type"] for event in dataset["events"]} >= {
        "COMPLAINT", "TRANSACTION_SIGNAL"
    }
    assert any(event["event_type"] == "CASHOUT_OBSERVED" for event in dataset["events"])
    signal_events = [event for event in dataset["events"] if event["event_type"] != "CASHOUT_OBSERVED"]
    assert len({event["amount_band"] for event in signal_events}) > 1
    assert len({event["channel"] for event in signal_events}) > 1
    assert len({event["category"] for event in signal_events}) > 1
    assert len({parse_timestamp(event["event_time"]).hour for event in signal_events}) > 1
    assert len({parse_timestamp(event["event_time"]).weekday() for event in signal_events}) > 1


def test_examples_use_only_information_available_at_as_of():
    dataset = small_dataset()

    validate_training_examples(dataset["training_examples"], dataset["events"])
    for example in dataset["training_examples"]:
        as_of = parse_timestamp(example["as_of"])
        assert example["horizon"] in HORIZONS
        assert all(parse_timestamp(value) <= as_of for value in example["feature_event_times"])
        assert all(parse_timestamp(value) <= as_of for value in example["feature_received_times"])
        assert not any(key.startswith("target_") for key in example["features"])
        assert example["provenance"] == "SYNTHETIC"


def test_outcome_targets_are_in_their_future_horizon_only():
    dataset = small_dataset()
    events = {event["event_id"]: event for event in dataset["events"]}

    for example in dataset["training_examples"]:
        as_of = parse_timestamp(example["as_of"])
        window_end = parse_timestamp(example["label_window_end"])
        for event_id in example["target_event_refs"]:
            event = events[event_id]
            event_time = parse_timestamp(event["event_time"])
            assert event["event_type"] == "CASHOUT_OBSERVED"
            assert as_of < event_time <= window_end


def test_examples_have_varied_cutoffs_and_horizons():
    dataset = small_dataset()

    assert len({example["as_of"] for example in dataset["training_examples"]}) > 1
    assert {example["horizon"] for example in dataset["training_examples"]} == set(HORIZONS)
    assert any(
        example["features"]["day_of_week"] >= 5
        for example in dataset["training_examples"]
    )
    assert DEFAULT_START.tzinfo == timezone.utc
