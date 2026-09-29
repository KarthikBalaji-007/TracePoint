from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture
def client(monkeypatch):
    db_path = Path(__file__).parent / f".prediction-{uuid4().hex}.sqlite3"
    monkeypatch.setenv("TRACEPOINT_DATABASE_PATH", str(db_path))
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        db_path.unlink(missing_ok=True)


def ingest(client, zone_id, event_key, minutes_ago=4, amount_band="BAND_4", channel="UPI", category="QR_FRAUD"):
    event_time = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")
    body = {
        "source_event_id": event_key,
        "event_type": "TRANSACTION_SIGNAL",
        "event_time": event_time,
        "jurisdiction_id": "SYN-JUR-01",
        "zone_id": zone_id,
        "amount_band": amount_band,
        "channel": channel,
        "category": category,
        "correlation_ref": f"demo-case-{event_key}",
        "provenance": "SYNTHETIC",
        "idempotency_key": event_key,
    }
    response = client.post("/api/v1/events", headers={"X-Source-Scope": "demo-scenario"}, json=body)
    assert response.status_code == 202, response.text
    assert client.post("/api/v1/worker/process").status_code == 200


def request_predictions(client, as_of):
    return client.post("/api/v1/predictions", json={
        "jurisdiction_id": "SYN-JUR-01",
        "horizons": ["+2h"],
        "as_of": as_of,
    })


def test_prediction_request_contract_supports_every_horizon(client):
    ingest(client, "SYN-ZONE-001", "all-horizons")
    as_of = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat().replace("+00:00", "Z")
    response = client.post("/api/v1/predictions", json={
        "jurisdiction_id": "SYN-JUR-01",
        "zone_ids": ["SYN-ZONE-001", "SYN-ZONE-005"],
        "horizons": ["+2h", "+6h", "+24h"],
        "as_of": as_of,
    })
    assert response.status_code == 200, response.text
    rows = response.json()["predictions"]
    assert {row["horizon"] for row in rows} == {"+2h", "+6h", "+24h"}
    required = {
        "prediction_id", "zone_id", "horizon", "historical_score_h", "live_score_l",
        "fused_score_f", "rank", "risk_band", "model_version", "fusion_version",
        "source_provenance", "data_quality", "explanation",
    }
    assert all(required.issubset(row) for row in rows)
    assert all(row["live_score_l"] is not None and row["fused_score_f"] is not None for row in rows)


def test_prediction_endpoint_response_and_deterministic_snapshot(client):
    ingest(client, "SYN-ZONE-001", "api-one")
    as_of = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat().replace("+00:00", "Z")
    first = request_predictions(client, as_of)
    second = request_predictions(client, as_of)
    assert first.status_code == 200, first.text
    assert first.json() == second.json()
    body = first.json()
    assert body["snapshot_id"].startswith("PREDSET-")
    assert len(body["predictions"]) == 2
    required = {
        "prediction_id", "zone_id", "horizon", "as_of", "window_start", "window_end",
        "historical_score_h", "live_score_l", "fused_score_f", "rank", "risk_band",
        "score_semantics", "model_version", "fusion_version", "source_provenance",
        "synthetic_only", "feature_as_of", "last_event_at", "data_quality", "uncertainty", "explanation",
    }
    assert all(required.issubset(item) for item in body["predictions"])
    active = next(item for item in body["predictions"] if item["zone_id"] == "SYN-ZONE-001")
    assert active["synthetic_only"] is True
    assert active["fused_score_f"] is not None
    assert active["rank"] == 1


def test_zone_catalogue_endpoint_and_local_cors(client):
    response = client.get("/api/v1/zones?jurisdiction_id=SYN-JUR-01", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 200
    body = response.json()
    assert body["synthetic_only"] is True
    assert body["source_provenance"] == ["SYNTHETIC"]
    assert {zone["zone_id"] for zone in body["zones"]} == {"SYN-ZONE-001", "SYN-ZONE-005"}
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_demo_new_event_changes_live_score_and_fused_ranking(client):
    baseline = client.post("/api/v1/demo/bootstrap", json={"jurisdiction_id": "SYN-JUR-01"})
    assert baseline.status_code == 200, baseline.text
    assert baseline.json()["seeded"] is True
    assert baseline.json()["provenance"] == "SYNTHETIC"
    queued = client.get(f"/api/v1/events/{baseline.json()['event_id']}/queue")
    assert queued.status_code == 200
    assert queued.json()["status"] == "PROCESSED"
    as_of_first = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat().replace("+00:00", "Z")
    first_response = request_predictions(client, as_of_first)
    assert first_response.status_code == 200, first_response.text
    first = first_response.json()["predictions"]
    initial_top = next(item["zone_id"] for item in first if item["rank"] == 1)
    initial_target = next(item for item in first if item["zone_id"] == "SYN-ZONE-005")

    ingest(client, "SYN-ZONE-005", "scenario-follow-up", amount_band="BAND_4", channel="UPI", category="QR_FRAUD")
    as_of_second = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat().replace("+00:00", "Z")
    second_response = request_predictions(client, as_of_second)
    assert second_response.status_code == 200, second_response.text
    second = second_response.json()["predictions"]
    new_top = next(item["zone_id"] for item in second if item["rank"] == 1)
    updated_target = next(item for item in second if item["zone_id"] == "SYN-ZONE-005")

    assert initial_top == "SYN-ZONE-001"
    assert new_top == "SYN-ZONE-005"
    assert updated_target["live_score_l"] > initial_target["live_score_l"]
    assert updated_target["fused_score_f"] > initial_target["fused_score_f"]


def test_health_check_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_allowed_origins_parsing(monkeypatch):
    from backend.app.main import get_allowed_origins

    monkeypatch.setenv("ALLOWED_ORIGINS", "https://tracepoint.vercel.app, https://demo.tracepoint.org ")
    origins = get_allowed_origins()
    assert "https://tracepoint.vercel.app" in origins
    assert "https://demo.tracepoint.org" in origins
    assert "http://localhost:5173" in origins

