"""Versioned, transparent parameters for the live zone-risk index."""

from dataclasses import dataclass


@dataclass(frozen=True)
class LiveRiskConfig:
    ruleset_version: str = "tracepoint-live-risk-v1"
    distance_decay_km: float = 35.0
    event_recency_tau_minutes: float = 90.0
    max_freshness_minutes: float = 180.0
    count_saturation: float = 8.0
    distinct_saturation: float = 6.0
    amount_saturation: float = 6.0
    count_weight: float = 0.40
    distinct_weight: float = 0.30
    amount_weight: float = 0.30
    amount_band_weights: tuple = (("BAND_1", 0.25), ("BAND_2", 0.5), ("BAND_3", 0.75), ("BAND_4", 1.0))
    # Explicit multiplier per prediction horizon; not learned or calibrated.
    horizon_factors: tuple = (("+2h", 1.0), ("+6h", 0.78), ("+24h", 0.48))

    def __post_init__(self):
        positive = (
            self.distance_decay_km,
            self.event_recency_tau_minutes,
            self.max_freshness_minutes,
            self.count_saturation,
            self.distinct_saturation,
            self.amount_saturation,
        )
        if any(value <= 0 for value in positive):
            raise ValueError("decay, freshness, and saturation parameters must be positive")
        weights = (self.count_weight, self.distinct_weight, self.amount_weight)
        if any(value < 0 for value in weights) or abs(sum(weights) - 1.0) > 1e-9:
            raise ValueError("activity weights must be non-negative and sum to 1")
        if tuple(h for h, _ in self.horizon_factors) != ("+2h", "+6h", "+24h"):
            raise ValueError("horizon_factors must define +2h, +6h, +24h in order")
        if any(not 0 <= factor <= 1 for _, factor in self.horizon_factors):
            raise ValueError("horizon factors must be in [0, 1]")


DEFAULT_LIVE_RISK_CONFIG = LiveRiskConfig()
