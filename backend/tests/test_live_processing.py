from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.database import database_connection, queue_status
from backend.app.main import app


@pytest.fixture
def client(monkeypatch):
    db_path = Path(__file__).parent / f".live-{uuid4().hex}.sqlite3"
    monkeypatch.setenv("TRACEPOINT_DATABASE_PATH", str(db_path))
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        db_path.unlink(missing_ok=True)


def make_event(key="event-1", **overrides):
    event_time = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
    payload = {
        "source_event_id": key,
        "event_type": "COMPLAINT",
        "event_time": event_time,
        "jurisdiction_id": "JUR-001",
        "zone_id": "ZONE-001",
        "location": None,
        "amount_band": "BAND_2",
        "channel": "UPI",
        "category": "PHISHING",
        "correlation_ref": f"case-{key}",
        "provenance": "SYNTHETIC",
        "idempotency_key": key,
    }
    return payload | overrides


def ingest(client, payload):
    return client.post(
        "/api/v1/events",
        headers={"X-Source-Scope": "demo-generator"},
        json=payload,
    )


def test_accepted_event_enters_durable_queue(client):
    response = ingest(client, make_event())

    assert response.status_code == 202
    queue = queue_status(response.json()["event_id"])
    assert queue["status"] == "PENDING"
    assert queue["processed_at"] is None


def test_worker_updates_zone_live_features_and_preserves_synthetic_provenance(client):
    payload = make_event()
    event_response = ingest(client, payload)
    event_id = event_response.json()["event_id"]

    worker = client.post("/api/v1/worker/process")
    features = client.get("/api/v1/live-features", params={"zone_id": "ZONE-001"})
    zone = features.json()["zones"][0]

    assert worker.status_code == 200
    assert worker.json()["processed_count"] == 1
    assert worker.json()["event_ids"] == [event_id]
    assert queue_status(event_id)["status"] == "PROCESSED"
    assert zone["recent_event_count"] == 1
    assert zone["distinct_event_count"] == 1
    assert zone["amount_band_counts"] == {"BAND_2": 1}
    assert zone["provenance_counts"] == {"SYNTHETIC": 1}
    assert zone["has_recent_data"] is True
    assert zone["last_event_at"] == payload["event_time"]
    assert zone["latest_processed_at"] != zone["last_event_at"]


def test_duplicate_does_not_queue_or_increment_features_twice(client):
    payload = make_event()
    first = ingest(client, payload)
    client.post("/api/v1/worker/process")
    duplicate = ingest(client, payload | {"provenance": "MANUAL_DEMO"})
    second_worker = client.post("/api/v1/worker/process")
    zone = client.get("/api/v1/live-features", params={"zone_id": "ZONE-001"}).json()["zones"][0]

    assert duplicate.json()["event_id"] == first.json()["event_id"]
    assert duplicate.json()["duplicate"] is True
    assert second_worker.json()["processed_count"] == 0
    assert zone["recent_event_count"] == 1
    assert zone["distinct_event_count"] == 1
    assert zone["provenance_counts"] == {"SYNTHETIC": 1}


def test_event_and_receipt_timestamps_are_retained_separately(client):
    payload = make_event()
    response = ingest(client, payload)
    event_id = response.json()["event_id"]

    with database_connection() as conn:
        stored = conn.execute(
            "SELECT event_time, received_at FROM complaint_events WHERE event_id = ?",
            (event_id,),
        ).fetchone()

    assert stored["event_time"] == payload["event_time"]
    assert stored["received_at"] == response.json()["received_at"]
    assert stored["event_time"] != stored["received_at"]


def test_processing_orders_pending_events_by_event_time(client):
    later_time = datetime.now(timezone.utc) - timedelta(minutes=2)
    earlier_time = later_time - timedelta(minutes=1)
    later = ingest(client, make_event("later", event_time=later_time.isoformat().replace("+00:00", "Z")))
    earlier = ingest(client, make_event("earlier", event_time=earlier_time.isoformat().replace("+00:00", "Z")))

    processed = client.post("/api/v1/worker/process").json()

    assert processed["event_ids"] == [earlier.json()["event_id"], later.json()["event_id"]]


def test_replay_uses_new_generation_without_changing_event_history(client):
    original = ingest(client, make_event())
    event_id = original.json()["event_id"]
    client.post("/api/v1/worker/process")

    replay = client.post("/api/v1/worker/replay")
    queued = queue_status(event_id)
    replay_result = client.post("/api/v1/worker/process").json()
    zone = client.get("/api/v1/live-features", params={"zone_id": "ZONE-001"}).json()["zones"][0]

    assert replay.status_code == 200
    assert replay.json()["generation"] == 2
    assert queued["generation"] == 2
    assert queued["status"] == "PENDING"
    assert replay_result["processed_count"] == 1
    assert zone["generation"] == 2
    assert zone["recent_event_count"] == 1


def test_unprocessed_zone_is_reported_as_having_no_recent_data(client):
    ingest(client, make_event())

    response = client.get("/api/v1/live-features")
    zone = response.json()["zones"][0]

    assert zone["zone_id"] == "ZONE-001"
    assert zone["has_recent_data"] is False
    assert zone["recent_event_count"] == 0
    assert zone["last_event_at"] is None
    assert zone["latest_processed_at"] is None
