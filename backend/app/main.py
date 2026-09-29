"""TracePoint ingestion API."""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from functools import lru_cache
import json
import os
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .database import create_or_get_event, get_prediction_events, initialize_database, queue_status
from .live_processing import get_live_features, process_pending_events, replay_events
from .models import EventStatus
from .schemas import (
    ComplaintEventIn,
    DemoBootstrapRequest,
    DemoBootstrapResponse,
    HealthResponse,
    IngestEventResponse,
    PredictionRequest,
    ReplayResponse,
    WorkerResponse,
)

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


def get_allowed_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return list(DEFAULT_ALLOWED_ORIGINS)
    configured = [origin.strip() for origin in raw.split(",") if origin.strip()]
    merged = list(configured)
    for dev in DEFAULT_ALLOWED_ORIGINS:
        if dev not in merged:
            merged.append(dev)
    return merged


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="TracePoint Backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Source-Scope", "Authorization", "Accept"],
)


@lru_cache(maxsize=1)
def _prediction_service():
    from ml.prediction_service import PredictionService
    return PredictionService()


@lru_cache(maxsize=1)
def _zone_catalogue():
    custom_path = os.environ.get("TRACEPOINT_ZONE_CATALOGUE")
    if custom_path:
        path = Path(custom_path)
    else:
        path = Path(__file__).resolve().parents[2] / "ml" / "data" / "zones.json"
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/api/v1/events", response_model=IngestEventResponse, status_code=202)
def ingest_event(
    payload: ComplaintEventIn,
    source_scope: Annotated[str, Header(alias="X-Source-Scope", min_length=1, max_length=200)],
) -> IngestEventResponse:
    normalized_scope = source_scope.strip()
    if not normalized_scope:
        raise HTTPException(status_code=422, detail="X-Source-Scope must not be blank")

    event, duplicate = create_or_get_event(payload, normalized_scope)
    return IngestEventResponse(
        event_id=event.event_id,
        status=EventStatus(event.status),
        provenance=event.provenance,
        received_at=event.received_at,
        duplicate=duplicate,
    )


@app.post("/api/v1/worker/process", response_model=WorkerResponse)
def run_event_worker(
    limit: int = Query(default=100, ge=1, le=1000),
) -> WorkerResponse:
    return WorkerResponse(**process_pending_events(limit))


@app.post("/api/v1/worker/replay", response_model=ReplayResponse)
def replay_event_processing() -> ReplayResponse:
    return ReplayResponse(**replay_events())


@app.get("/api/v1/live-features")
def read_live_features(
    zone_id: str | None = Query(default=None, min_length=1, max_length=200),
    window_minutes: int = Query(default=60, ge=1, le=1440),
    as_of: datetime | None = Query(default=None),
) -> dict:
    return get_live_features(zone_id, window_minutes, as_of)


@app.get("/api/v1/zones")
def read_zone_catalogue(
    jurisdiction_id: str | None = Query(default=None, min_length=1, max_length=200),
) -> dict:
    zones = _zone_catalogue()
    if jurisdiction_id:
        zones = [zone for zone in zones if zone.get("jurisdiction_id") == jurisdiction_id]
    return {
        "zones": zones,
        "source_provenance": sorted({zone.get("source_class", "UNKNOWN") for zone in zones}),
        "synthetic_only": bool(zones) and all(zone.get("source_class") == "SYNTHETIC" for zone in zones),
    }


@app.post("/api/v1/demo/bootstrap", response_model=DemoBootstrapResponse)
def bootstrap_synthetic_demo(payload: DemoBootstrapRequest) -> DemoBootstrapResponse:
    """Seed one honest, coarse synthetic signal when a demo zone has no live data."""
    jurisdiction_zones = [
        zone for zone in _zone_catalogue()
        if zone.get("jurisdiction_id") == payload.jurisdiction_id and zone.get("active", True)
    ]
    if not jurisdiction_zones or any(zone.get("source_class") != "SYNTHETIC" for zone in jurisdiction_zones):
        raise HTTPException(status_code=409, detail="synthetic bootstrap is only available for synthetic jurisdictions")

    zone_ids = {zone["zone_id"] for zone in jurisdiction_zones}
    current = get_live_features(window_minutes=180)
    if any(row.get("has_recent_data") for row in current.get("zones", []) if row.get("zone_id") in zone_ids):
        return DemoBootstrapResponse(seeded=False, reason="RECENT_LIVE_DATA_EXISTS")

    zone = sorted(jurisdiction_zones, key=lambda item: item["zone_id"])[0]
    event_time = datetime.now(timezone.utc)
    stamp = event_time.isoformat(timespec="seconds").replace("+00:00", "Z")
    event_key = f"tracepoint-demo-baseline-v1:{event_time:%Y%m%dT%H}"
    event_payload = ComplaintEventIn(
        source_event_id=event_key,
        event_type="TRANSACTION_SIGNAL",
        event_time=stamp,
        jurisdiction_id=payload.jurisdiction_id,
        zone_id=zone["zone_id"],
        amount_band="BAND_1",
        channel="CARD",
        category="PHISHING",
        correlation_ref=event_key,
        provenance="SYNTHETIC",
        idempotency_key=event_key,
    )
    event, duplicate = create_or_get_event(event_payload, "tracepoint-dashboard-demo")
    processed = process_pending_events()
    return DemoBootstrapResponse(
        seeded=not duplicate,
        event_id=event.event_id,
        zone_id=zone["zone_id"],
        provenance=event.provenance,
        processed_count=processed["processed_count"],
        reason="BASELINE_CREATED" if not duplicate else "BASELINE_ALREADY_EXISTS",
    )


@app.get("/api/v1/events/{event_id}/queue")
def read_event_queue_status(event_id: str) -> dict:
    status = queue_status(event_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Event is not queued in the active generation")
    return {"event_id": event_id, **status}


@app.post("/api/v1/predictions")
def generate_predictions(payload: PredictionRequest) -> dict:
    from ml.prediction_service import format_time, parse_as_of

    as_of = parse_as_of(payload.as_of or datetime.now(timezone.utc))
    zones = _zone_catalogue()
    jurisdiction_zones = [zone for zone in zones if zone.get("jurisdiction_id") == payload.jurisdiction_id]
    if not jurisdiction_zones:
        raise HTTPException(status_code=404, detail="jurisdiction has no zones in the configured catalogue")
    events = get_prediction_events(format_time(as_of))
    live_features = get_live_features(window_minutes=180, as_of=as_of)
    try:
        service = _prediction_service()
    except (FileNotFoundError, OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="registered historical model artifacts are unavailable or invalid") from exc
    try:
        return service.predict(
            jurisdiction_id=payload.jurisdiction_id,
            zones=zones,
            events=events,
            live_features=live_features,
            as_of=as_of,
            zone_ids=payload.zone_ids,
            horizons=payload.horizons,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
