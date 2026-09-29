"""SQLite-backed event queue, replay, and rolling zone features."""

from datetime import datetime, timedelta, timezone

from .database import current_generation, database_connection


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _format_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def process_pending_events(limit: int = 100) -> dict:
    """Process a pending batch in event-time order; each event is applied once per generation."""
    processed_ids = []
    with database_connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        generation = current_generation(conn)
        rows = conn.execute(
            """
            SELECT q.event_id, e.zone_id, e.source_scope, e.source_event_id,
                   e.event_time, e.received_at, e.amount_band, e.provenance
            FROM event_queue q
            JOIN complaint_events e ON e.event_id = q.event_id
            WHERE q.generation = ? AND q.status = 'PENDING'
              AND e.status = 'ACCEPTED'
            ORDER BY e.event_time ASC, e.received_at ASC, e.event_id ASC
            LIMIT ?
            """,
            (generation, limit),
        ).fetchall()
        for row in rows:
            processed_at = _format_timestamp(_now_utc())
            if row["zone_id"] is not None:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO live_processed_events (
                        event_id, generation, zone_id, source_scope, source_event_id,
                        event_time, received_at, amount_band, provenance, processed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row["event_id"], generation, row["zone_id"], row["source_scope"],
                        row["source_event_id"], row["event_time"], row["received_at"],
                        row["amount_band"], row["provenance"], processed_at,
                    ),
                )
            conn.execute(
                """
                UPDATE event_queue SET status = 'PROCESSED', processed_at = ?
                WHERE event_id = ? AND generation = ? AND status = 'PENDING'
                """,
                (processed_at, row["event_id"], generation),
            )
            processed_ids.append(row["event_id"])
    return {
        "generation": generation,
        "processed_count": len(processed_ids),
        "event_ids": processed_ids,
    }


def replay_events() -> dict:
    """Queue all accepted events in a new generation without changing event history."""
    queued_at = _format_timestamp(_now_utc())
    with database_connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        generation = current_generation(conn) + 1
        conn.execute(
            "UPDATE processor_state SET active_generation = ? WHERE singleton_id = 1",
            (generation,),
        )
        cursor = conn.execute(
            """
            INSERT INTO event_queue (event_id, generation, status, queued_at)
            SELECT event_id, ?, 'PENDING', ?
            FROM complaint_events WHERE status = 'ACCEPTED'
            """,
            (generation, queued_at),
        )
        queued_count = cursor.rowcount
    return {"generation": generation, "queued_count": queued_count}


def _zone_ids(conn, zone_id: str | None, generation: int) -> list[str]:
    if zone_id is not None:
        return [zone_id]
    rows = conn.execute(
        """
        SELECT zone_id FROM complaint_events WHERE status = 'ACCEPTED' AND zone_id IS NOT NULL
        UNION
        SELECT zone_id FROM live_processed_events WHERE generation = ?
        ORDER BY zone_id
        """,
        (generation,),
    ).fetchall()
    return [row[0] for row in rows]


def _zone_features(conn, zone_id: str, generation: int, window_minutes: int, as_of=None) -> dict:
    now = as_of or _now_utc()
    cutoff = _format_timestamp(now - timedelta(minutes=window_minutes))
    now_text = _format_timestamp(now)
    all_rows = conn.execute(
        """
        SELECT MAX(event_time) AS last_event_at, MAX(processed_at) AS latest_processed_at
        FROM live_processed_events WHERE generation = ? AND zone_id = ?
          AND event_time <= ? AND received_at <= ?
        """,
        (generation, zone_id, now_text, now_text),
    ).fetchone()
    recent_count = conn.execute(
        """
        SELECT COUNT(*) FROM live_processed_events
        WHERE generation = ? AND zone_id = ? AND event_time >= ? AND event_time <= ?
          AND received_at <= ?
        """,
        (generation, zone_id, cutoff, now_text, now_text),
    ).fetchone()[0]
    distinct_count = conn.execute(
        """
        SELECT COUNT(*) FROM (
            SELECT source_scope, COALESCE(source_event_id, event_id) AS distinct_key
            FROM live_processed_events
            WHERE generation = ? AND zone_id = ? AND event_time >= ? AND event_time <= ?
              AND received_at <= ?
            GROUP BY source_scope, COALESCE(source_event_id, event_id)
        )
        """,
        (generation, zone_id, cutoff, now_text, now_text),
    ).fetchone()[0]
    band_rows = conn.execute(
        """
        SELECT amount_band, COUNT(*) AS event_count
        FROM live_processed_events
        WHERE generation = ? AND zone_id = ? AND event_time >= ? AND event_time <= ?
          AND received_at <= ?
          AND amount_band IS NOT NULL
        GROUP BY amount_band
        """,
        (generation, zone_id, cutoff, now_text, now_text),
    ).fetchall()
    provenance_rows = conn.execute(
        """
        SELECT provenance, COUNT(*) AS event_count
        FROM live_processed_events
        WHERE generation = ? AND zone_id = ? AND event_time >= ? AND event_time <= ?
          AND received_at <= ?
        GROUP BY provenance
        """,
        (generation, zone_id, cutoff, now_text, now_text),
    ).fetchall()
    return {
        "zone_id": zone_id,
        "generation": generation,
        "window_minutes": window_minutes,
        "recent_event_count": recent_count,
        "distinct_event_count": distinct_count,
        "amount_band_counts": {row["amount_band"]: row["event_count"] for row in band_rows},
        "provenance_counts": {row["provenance"]: row["event_count"] for row in provenance_rows},
        "last_event_at": all_rows["last_event_at"],
        "latest_processed_at": all_rows["latest_processed_at"],
        "has_recent_data": recent_count > 0,
        "as_of": now_text,
    }


def get_live_features(zone_id: str | None = None, window_minutes: int = 60, as_of=None) -> dict:
    if isinstance(as_of, str):
        now = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
        if now.utcoffset() is None:
            raise ValueError("as_of must include a timezone")
        now = now.astimezone(timezone.utc)
    else:
        now = as_of.astimezone(timezone.utc) if as_of else _now_utc()
    with database_connection() as conn:
        generation = current_generation(conn)
        zone_ids = _zone_ids(conn, zone_id, generation)
        zones = [_zone_features(conn, item, generation, window_minutes, now) for item in zone_ids]
    return {
        "generation": generation,
        "window_minutes": window_minutes,
        "zones": zones,
        "as_of": _format_timestamp(now),
    }
