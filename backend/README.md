# TracePoint Backend Foundation

Minimal event-ingestion service for the TracePoint hackathon MVP. It validates and persists normalized `ComplaintEvent` records in local SQLite. This service does not implement ML, risk scoring, authentication, or integrations with real complaint/payment systems.

## Requirements

- Python 3.11+
- pip

## Setup and run

From the canonical workspace root (`C:\\Karthik\\Engg\\Projects\\MST\\TracePoint`), install both runtime sets and the root package in editable mode:

```powershell
python -m pip install -r backend/requirements.txt -r ml/requirements.txt
python -m pip install -e .
python -m backend
```

For reload during development use `python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000` from the workspace root. The root package installs `backend` and `ml` together; this keeps imports consistent for direct tests, local development, and an installed deployment. Do not launch `app.main:app --app-dir backend`, because that makes `backend/` rather than the project root the import base and prevents the prediction service from resolving `ml`.

The health check is `http://127.0.0.1:8000/health`; event ingestion is `POST http://127.0.0.1:8000/api/v1/events`. The OpenAPI page is available at `/docs`.

SQLite is created at `backend/data/tracepoint.sqlite3` by default. Set `TRACEPOINT_DATABASE_PATH` to use another local file. No raw complaint narrative, direct identity, account identifier, or exact transaction amount is part of the ingestion contract. Location coordinates are accepted only as restricted off-chain event fields.

## Ingest an event

Every request must include `X-Source-Scope`; idempotency is unique per source scope and `idempotency_key`. Provenance must be one of `REAL_AUTHORIZED`, `SYNTHETIC`, or `MANUAL_DEMO`. The demo should use `SYNTHETIC` or `MANUAL_DEMO`; `REAL_AUTHORIZED` is a provenance label, not an authorization mechanism.

```powershell
$body = @{
  event_type = 'COMPLAINT'
  event_time = '2026-09-29T10:15:00Z'
  jurisdiction_id = 'JUR-001'
  zone_id = 'ZONE-001'
  correlation_ref = 'case-ref-001'
  provenance = 'SYNTHETIC'
  idempotency_key = 'demo:001'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/events' `
  -Headers @{ 'X-Source-Scope' = 'demo-generator' } `
  -ContentType 'application/json' -Body $body
```

Valid timestamps require an RFC3339 timezone (`Z` or an explicit offset). Invalid requests return HTTP 422 and are not persisted. Repeating an idempotency key in the same source scope returns the original event identity and `duplicate: true`; another source scope has a separate idempotency namespace.

The model/database supports `ACCEPTED`, `QUARANTINED`, `CORRECTED`, and `REJECTED`. This initial endpoint persists valid requests as `ACCEPTED`; schema/enum failures are rejected at the API boundary and are not written as event rows. Quarantine and correction workflows are not part of this ingestion foundation.

## Live event processing

Accepted events are inserted into the SQLite `event_queue` in the same transaction as the event row. `(event_id, generation)` is unique, so an idempotent ingestion retry does not enqueue another delivery. This MVP uses an explicit worker tick rather than a background broker:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/worker/process'
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/v1/live-features?zone_id=ZONE-001'
```

The processor takes pending accepted events in `event_time`, then `received_at`, then ID order. It preserves both timestamps and provenance in processed-event rows. Zone features use a rolling 60-minute event-time window by default; set `window_minutes` from 1 to 1440. `distinct_event_count` counts unique source-scoped `source_event_id` values, falling back to the TracePoint event ID. Amount-band and provenance counts include recent processed events. A zone with no recent processed event appears with `has_recent_data: false`, zero recent counts, and null timestamps when requesting one zone. Reading all zones includes accepted zones not yet processed.

Replay is an explicit new processing generation:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/worker/replay'
```

Replay enqueues all accepted source events in a new generation. Raw ComplaintEvent rows and previous generation records are retained; live-feature reads use only the active generation. This makes reprocessing repeatable without editing or deleting historical events.

## Predictive intelligence

Install `backend/requirements.txt` and `ml/requirements.txt` (the model service uses scikit-learn, NumPy, and joblib). With the default synthetic zone catalogue and registered historical model available, request ranked predictions with:

```powershell
$body = @{
  jurisdiction_id = 'SYN-JUR-01'
  horizons = @('+2h', '+6h', '+24h')
  as_of = '2026-09-29T10:15:00Z'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/predictions' `
  -ContentType 'application/json' -Body $body
```

`zone_ids` is optional; `horizons` defaults to all three supported windows and `as_of` defaults to current UTC. The response has a deterministic snapshot ID and per-zone/horizon H, L, F, rank, band, provenance, quality, and explanation. If live evidence is unavailable, L and F stay null and that row is not ranked. H is the uncalibrated registered model score; F is a versioned relative prioritization index. Current initial demo fusion weights and band thresholds are described in `ml/README.md`; they are not calibrated operational estimates.

For the end-to-end scenario, run `python -m pytest -p no:cacheprovider backend/tests/test_prediction_api.py`; it ingests and processes a new synthetic signal and checks that the live score and fused top-ranked zone change.

## Tests

```powershell
pytest -p no:cacheprovider backend/tests
```

Tests use a temporary SQLite database and do not write demo events to the default database.
