"""Versioned initial demo fusion weights and prioritization bands."""

from dataclasses import dataclass


@dataclass(frozen=True)
class FusionConfig:
    fusion_version: str = "tracepoint-fusion-demo-v1"
    # Initial, rules-based demo weights; not fit or calibrated against field data.
    horizon_weights: tuple = (
        ("+2h", 0.45, 0.55),
        ("+6h", 0.60, 0.40),
        ("+24h", 0.75, 0.25),
    )
    band_version: str = "tracepoint-bands-v1"
    risk_band_thresholds: tuple = (("CRITICAL", 0.75), ("HIGH", 0.50), ("MEDIUM", 0.25), ("LOW", 0.0))

    def __post_init__(self):
        if tuple(row[0] for row in self.horizon_weights) != ("+2h", "+6h", "+24h"):
            raise ValueError("weights must define +2h, +6h, +24h in order")
        if any(a < 0 or b < 0 or abs(a + b - 1.0) > 1e-9 for _, a, b in self.horizon_weights):
            raise ValueError("each horizon's H/L weights must be non-negative and sum to 1")
        if not self.risk_band_thresholds or self.risk_band_thresholds[-1][1] != 0.0:
            raise ValueError("risk bands must end with a zero-threshold band")

    def weights_for(self, horizon):
        for key, historical, live in self.horizon_weights:
            if key == horizon:
                return historical, live
        raise ValueError(f"unsupported horizon: {horizon}")


DEFAULT_FUSION_CONFIG = FusionConfig()
