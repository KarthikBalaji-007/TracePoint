"""Validated HTTP contracts for ComplaintEvent ingestion."""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from .models import AmountBand, EventStatus, EventType, Provenance


NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
IdempotencyKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=256)]
_RFC3339 = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


class ComplaintEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_event_id: NonEmpty | None = None
    event_type: EventType
    event_time: datetime
    jurisdiction_id: NonEmpty
    zone_id: NonEmpty | None
    location: dict[str, float] | None = None
    amount_band: AmountBand | None = None
    channel: NonEmpty | None = None
    category: NonEmpty | None = None
    correlation_ref: NonEmpty
    provenance: Provenance
    idempotency_key: IdempotencyKey

    @field_validator("event_time", mode="before")
    @classmethod
    def require_rfc3339_with_offset(cls, value):
        if not isinstance(value, str) or not _RFC3339.fullmatch(value):
            raise ValueError("event_time must be an RFC3339 timestamp with timezone offset")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("event_time is not a valid RFC3339 timestamp") from exc
        if parsed.utcoffset() is None:
            raise ValueError("event_time must include a timezone offset")
        return parsed

    @field_validator("location")
    @classmethod
    def validate_location(cls, value):
        if value is None:
            return value
        if set(value) != {"lat", "lon"}:
            raise ValueError("location must contain exactly lat and lon")
        lat, lon = value["lat"], value["lon"]
        if not -90 <= lat <= 90 or not -180 <= lon <= 180:
            raise ValueError("location coordinates are out of range")
        return value


class IngestEventResponse(BaseModel):
    event_id: str
    status: EventStatus
    provenance: Provenance
    received_at: datetime
    duplicate: bool


class HealthResponse(BaseModel):
    status: str


class WorkerResponse(BaseModel):
    generation: int
    processed_count: int
    event_ids: list[str]


class ReplayResponse(BaseModel):
    generation: int
    queued_count: int


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jurisdiction_id: NonEmpty
    zone_ids: list[NonEmpty] | None = None
    horizons: list[Literal["+2h", "+6h", "+24h"]] = ["+2h", "+6h", "+24h"]
    as_of: datetime | None = None

    @field_validator("as_of", mode="before")
    @classmethod
    def require_rfc3339_timezone(cls, value):
        if value is None:
            return value
        if not isinstance(value, str) or not _RFC3339.fullmatch(value):
            raise ValueError("as_of must be an RFC3339 timestamp with timezone offset")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("as_of is not a valid RFC3339 timestamp") from exc
        if parsed.utcoffset() is None:
            raise ValueError("as_of must include a timezone offset")
        return parsed

    @field_validator("horizons")
    @classmethod
    def require_unique_horizons(cls, value):
        if not value or len(set(value)) != len(value):
            raise ValueError("horizons must be non-empty and unique")
        return value


class DemoBootstrapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jurisdiction_id: NonEmpty


class DemoBootstrapResponse(BaseModel):
    seeded: bool
    event_id: str | None = None
    zone_id: str | None = None
    provenance: Provenance | None = None
    processed_count: int = 0
    reason: str
