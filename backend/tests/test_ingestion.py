from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import DEFAULT_DATABASE_PATH


def test_default_database_path_is_project_relative():
    root = Path(__file__).resolve().parents[2]
    assert DEFAULT_DATABASE_PATH == root / "backend" / "data" / "tracepoint.sqlite3"


@pytest.fixture
def client(monkeypatch):
    db_path = Path(__file__).parent / f".ingestion-{uuid4().hex}.sqlite3"
    monkeypatch.setenv("TRACEPOINT_DATABASE_PATH", str(db_path))
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        db_path.unlink(missing_ok=True)


def event_payload(**overrides):
    payload = {
        "source_event_id": "demo-event-001",
        "event_type": "COMPLAINT",
        "event_time": "2026-09-29T10:15:00Z",
        "jurisdiction_id": "JUR-001",
        "zone_id": "ZONE-001",
        "location": {"lat": 12.9716, "lon": 77.5946},
        "amount_band": "BAND_2",
        "channel": "UPI",
        "category": "PHISHING",
        "correlation_ref": "opaque-case-ref-001",
        "provenance": "SYNTHETIC",
        "idempotency_key": "generator:event-001",
    }
    return payload | overrides


def test_ingests_valid_synthetic_event(client):
    response = client.post(
        "/api/v1/events",
        headers={"X-Source-Scope": "demo-generator"},
        json=event_payload(),
    )

    assert response.status_code == 202
    body = response.json()
    assert body["event_id"].startswith("EVT-")
    assert body["status"] == "ACCEPTED"
    assert body["provenance"] == "SYNTHETIC"
    assert body["received_at"].endswith("Z")
    assert body["duplicate"] is False


def test_rejects_invalid_event_without_persisting(client):
    response = client.post(
        "/api/v1/events",
        headers={"X-Source-Scope": "demo-generator"},
        json=event_payload(event_time="2026-09-29 10:15:00", provenance="FABRICATED"),
    )

    assert response.status_code == 422


def test_duplicate_idempotency_key_returns_original_event(client):
    headers = {"X-Source-Scope": "demo-generator"}
    first = client.post("/api/v1/events", headers=headers, json=event_payload())
    duplicate = client.post(
        "/api/v1/events",
        headers=headers,
        json=event_payload(source_event_id="different-id", provenance="MANUAL_DEMO"),
    )

    assert first.status_code == 202
    assert duplicate.status_code == 202
    assert duplicate.json()["event_id"] == first.json()["event_id"]
    assert duplicate.json()["provenance"] == "SYNTHETIC"
    assert duplicate.json()["received_at"] == first.json()["received_at"]
    assert duplicate.json()["duplicate"] is True


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
