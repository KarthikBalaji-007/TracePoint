"""Small SQLite persistence layer for accepted ComplaintEvents."""

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .models import ComplaintEvent, EventStatus


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _default_database_path() -> Path:
    if (PROJECT_ROOT / "pyproject.toml").is_file():
        return PROJECT_ROOT / "backend" / "data" / "tracepoint.sqlite3"
    if os.name == "nt":
        data_root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    else:
        data_root = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return data_root / "TracePoint" / "tracepoint.sqlite3"


DEFAULT_DATABASE_PATH = _default_database_path()


def database_path() -> Path:
    return Path(os.environ.get("TRACEPOINT_DATABASE_PATH", str(DEFAULT_DATABASE_PATH)))


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def database_connection():
    conn = connect()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def initialize_database() -> None:
    with database_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS complaint_events (
                event_id TEXT PRIMARY KEY,
                source_scope TEXT NOT NULL,
                source_event_id TEXT,
                event_type TEXT NOT NULL CHECK (event_type IN (
                    'COMPLAINT', 'TRANSACTION_SIGNAL', 'CASHOUT_OBSERVED', 'CORRECTION'
                )),
                event_time TEXT NOT NULL,
                received_at TEXT NOT NULL,
                jurisdiction_id TEXT NOT NULL,
                zone_id TEXT,
                location_lat REAL,
                location_lon REAL,
                amount_band TEXT CHECK (amount_band IS NULL OR amount_band IN (
                    'BAND_1', 'BAND_2', 'BAND_3', 'BAND_4'
                )),
                channel TEXT,
                category TEXT,
                correlation_ref TEXT NOT NULL,
                provenance TEXT NOT NULL CHECK (provenance IN (
                    'REAL_AUTHORIZED', 'SYNTHETIC', 'MANUAL_DEMO'
                )),
                source_ref TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                quality_json TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN (
                    'ACCEPTED', 'QUARANTINED', 'CORRECTED', 'REJECTED'
                )),
                UNIQUE (source_scope, idempotency_key)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS processor_state (
                singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
                active_generation INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            "INSERT OR IGNORE INTO processor_state (singleton_id, active_generation) VALUES (1, 1)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_queue (
                queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL REFERENCES complaint_events(event_id),
                generation INTEGER NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSED')),
                queued_at TEXT NOT NULL,
                processed_at TEXT,
                UNIQUE (event_id, generation)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS live_processed_events (
                event_id TEXT NOT NULL REFERENCES complaint_events(event_id),
                generation INTEGER NOT NULL,
                zone_id TEXT NOT NULL,
                source_scope TEXT NOT NULL,
                source_event_id TEXT,
                event_time TEXT NOT NULL,
                received_at TEXT NOT NULL,
                amount_band TEXT,
                provenance TEXT NOT NULL CHECK (provenance IN (
                    'REAL_AUTHORIZED', 'SYNTHETIC', 'MANUAL_DEMO'
                )),
                processed_at TEXT NOT NULL,
                PRIMARY KEY (event_id, generation)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_live_events_zone_time "
            "ON live_processed_events (generation, zone_id, event_time)"
        )
        # Queue accepted records created before the durable queue was introduced.
        conn.execute(
            """
            INSERT OR IGNORE INTO event_queue (event_id, generation, status, queued_at)
            SELECT e.event_id, s.active_generation, 'PENDING', e.received_at
            FROM complaint_events e CROSS JOIN processor_state s
            WHERE e.status = 'ACCEPTED'
            """
        )


def _timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def create_or_get_event(payload, source_scope: str) -> tuple[ComplaintEvent, bool]:
    received_at = datetime.now(timezone.utc)
    event_id = f"EVT-{uuid4()}"
    source_ref = payload.source_event_id or source_scope
    location = payload.location or {}
    quality = {
        "validation": "PASSED",
        "missing_optional_fields": [
            name for name, value in (
                ("location", payload.location),
                ("amount_band", payload.amount_band),
                ("channel", payload.channel),
                ("category", payload.category),
            ) if value is None
        ],
        "source_confidence": "UNASSESSED",
    }

    values = (
        event_id,
        source_scope,
        payload.source_event_id,
        payload.event_type.value,
        _timestamp(payload.event_time),
        _timestamp(received_at),
        payload.jurisdiction_id,
        payload.zone_id,
        location.get("lat"),
        location.get("lon"),
        payload.amount_band.value if payload.amount_band else None,
        payload.channel,
        payload.category,
        payload.correlation_ref,
        payload.provenance.value,
        source_ref,
        payload.idempotency_key,
        json.dumps(quality, separators=(",", ":")),
        EventStatus.ACCEPTED.value,
    )
    with database_connection() as conn:
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO complaint_events (
                event_id, source_scope, source_event_id, event_type, event_time,
                received_at, jurisdiction_id, zone_id, location_lat, location_lon,
                amount_band, channel, category, correlation_ref, provenance,
                source_ref, idempotency_key, quality_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )
        duplicate = cursor.rowcount == 0
        if not duplicate:
            generation = conn.execute(
                "SELECT active_generation FROM processor_state WHERE singleton_id = 1"
            ).fetchone()[0]
            conn.execute(
                """
                INSERT INTO event_queue (event_id, generation, status, queued_at)
                VALUES (?, ?, 'PENDING', ?)
                """,
                (event_id, generation, _timestamp(received_at)),
            )
        row = conn.execute(
            "SELECT * FROM complaint_events WHERE source_scope = ? AND idempotency_key = ?",
            (source_scope, payload.idempotency_key),
        ).fetchone()
    return _to_model(row), duplicate


def current_generation(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT active_generation FROM processor_state WHERE singleton_id = 1"
    ).fetchone()
    return int(row[0])


def queue_status(event_id: str) -> dict | None:
    with database_connection() as conn:
        generation = current_generation(conn)
        row = conn.execute(
            """
            SELECT status, queued_at, processed_at FROM event_queue
            WHERE event_id = ? AND generation = ?
            """,
            (event_id, generation),
        ).fetchone()
    return {"generation": generation, **dict(row)} if row else None


def get_prediction_events(as_of: str) -> list[dict]:
    """Return accepted normalized inputs available by the prediction cutoff."""
    with database_connection() as conn:
        rows = conn.execute(
            """
            SELECT event_id, source_event_id, source_scope, event_type, event_time,
                   received_at, jurisdiction_id, zone_id, amount_band, channel,
                   category, provenance, status
            FROM complaint_events
            WHERE status = 'ACCEPTED' AND event_time <= ? AND received_at <= ?
            ORDER BY event_time, received_at, event_id
            """,
            (as_of, as_of),
        ).fetchall()
    return [dict(row) for row in rows]


def _to_model(row: sqlite3.Row) -> ComplaintEvent:
    return ComplaintEvent(
        event_id=row["event_id"],
        source_scope=row["source_scope"],
        source_event_id=row["source_event_id"],
        event_type=row["event_type"],
        event_time=row["event_time"],
        received_at=row["received_at"],
        jurisdiction_id=row["jurisdiction_id"],
        zone_id=row["zone_id"],
        location_lat=row["location_lat"],
        location_lon=row["location_lon"],
        amount_band=row["amount_band"],
        channel=row["channel"],
        category=row["category"],
        correlation_ref=row["correlation_ref"],
        provenance=row["provenance"],
        source_ref=row["source_ref"],
        idempotency_key=row["idempotency_key"],
        quality_json=row["quality_json"],
        status=row["status"],
    )
