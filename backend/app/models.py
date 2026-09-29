"""Logical ComplaintEvent model values and lifecycle enums."""

from dataclasses import dataclass
from enum import StrEnum


class Provenance(StrEnum):
    REAL_AUTHORIZED = "REAL_AUTHORIZED"
    SYNTHETIC = "SYNTHETIC"
    MANUAL_DEMO = "MANUAL_DEMO"


class EventType(StrEnum):
    COMPLAINT = "COMPLAINT"
    TRANSACTION_SIGNAL = "TRANSACTION_SIGNAL"
    CASHOUT_OBSERVED = "CASHOUT_OBSERVED"
    CORRECTION = "CORRECTION"


class EventStatus(StrEnum):
    ACCEPTED = "ACCEPTED"
    QUARANTINED = "QUARANTINED"
    CORRECTED = "CORRECTED"
    REJECTED = "REJECTED"


class AmountBand(StrEnum):
    BAND_1 = "BAND_1"
    BAND_2 = "BAND_2"
    BAND_3 = "BAND_3"
    BAND_4 = "BAND_4"


@dataclass(frozen=True)
class ComplaintEvent:
    event_id: str
    source_scope: str
    source_event_id: str | None
    event_type: EventType
    event_time: str
    received_at: str
    jurisdiction_id: str
    zone_id: str | None
    location_lat: float | None
    location_lon: float | None
    amount_band: AmountBand | None
    channel: str | None
    category: str | None
    correlation_ref: str
    provenance: Provenance
    source_ref: str
    idempotency_key: str
    quality_json: str
    status: EventStatus
