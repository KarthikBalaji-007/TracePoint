# Synthetic Data Foundation

`generate_synthetic.py` creates a small, reproducible, fully synthetic TracePoint dataset. No records represent real complaints, transactions, people, or cash-outs. Every generated zone, event, and training example is labeled `SYNTHETIC`.

## Generate

From the workspace root:

```powershell
python ml/generate_synthetic.py
python ml/generate_synthetic.py --zones 12 --events 1200 --days 45 --seed 7
```

The `--events` value is the number of complaint/transaction signals; the generator may add corresponding cash-out outcome events. The default fixed start is `2026-01-01T00:00:00Z`, so identical options and seed produce byte-identical files. Output defaults to `ml/data/`; `--output-dir` can select another location within the ML workspace.

Generated files:

| File | Contents |
| --- | --- |
| `zones.json` | Synthetic zone IDs, jurisdiction IDs, approximate synthetic centroids, cash-point density, and provenance. |
| `events.jsonl` | Normalized complaint, transaction-signal, and corresponding `CASHOUT_OBSERVED` outcome events, ordered by event time. Each event retains separate `event_time` and `received_at` values. |
| `training_examples.jsonl` | One row per zone, cutoff, and horizon, including feature fields and a future-window binary target. |

## Historical Example and Target

Each example defines `as_of`, `zone_id`, and one horizon: `+2h`, `+6h`, or `+24h`. `features` are calculated from the preceding 24 hours and static zone attributes known before the cutoff. An event can contribute only when both its `event_time` and `received_at` are at or before `as_of`. Source event references and their timestamps are retained beside the features for audit and leakage checks.

`target_cashout_in_window` is 1 when at least one synthetic `CASHOUT_OBSERVED` event for that zone occurs in `(as_of, as_of + horizon]`; otherwise it is 0. Target event references and label-window bounds are stored separately from `features`. The generator does not export the random outcome probability or other target-generation fields as model inputs. Historical cash-out events may be features only after their event and receipt times are both at or before `as_of`.

Generation intentionally varies zone cash-point density, event volume by density, time of day, weekday/weekend, amount band, channel, category, report delay, and cash-out outcome rate. These synthetic patterns are useful for demonstrating pipeline mechanics, not for claiming field accuracy or calibrated risk.

## Validate

```powershell
python -m pytest -p no:cacheprovider ml/tests
```

Validation checks provenance, deterministic generation, ordered timestamps, legal horizon labels, exact feature-field membership, and that every feature event and availability timestamp is no later than its example's `as_of`.

## Historical Baseline

Install `ml/requirements.txt`, generate the dataset, and train:

```powershell
pip install -r ml/requirements.txt
python ml/generate_synthetic.py
python ml/train_baseline.py
```

The training script uses only a fixed flattened allowlist from `features`; target references, label-window fields, feature timestamps, and all other fields are excluded. It rechecks event and receipt timestamps against `as_of` before training. The target is exactly `target_cashout_in_window`: whether at least one synthetic `CASHOUT_OBSERVED` event for that zone occurs in `(as_of, as_of + horizon]`.

Examples are split chronologically by unique `as_of`: 60% train, 20% validation, and 20% final out-of-time test. All zones and horizons sharing a cutoff stay in one partition. Each candidate has its own scaler/one-hot preprocessor fitted only on train rows. Selection uses validation Precision@5%, then PR-AUC, ROC-AUC, and a fixed candidate order; test metrics do not influence selection. Precision/recall/F1 at 0.5 use an uncalibrated raw-score reporting threshold. No calibration is claimed.

Artifacts are written under `ml/artifacts/`: selected `model.joblib`, `preprocessor.joblib`, `feature_list.json`, `model_metadata.json`, `evaluation.json`, and `feature_importance.json`. Model version is derived deterministically from the seed and training-example content hash. Metrics are labeled `SYNTHETIC-ONLY` when zones, training examples, and source events all carry that provenance; they are not operational accuracy.

## Live Spatio-Temporal Risk Index

`live_risk.py` consumes the backend `get_live_features` response (or its `zones` list), the zone catalogue, and an explicit timezone-aware `as_of`. It returns one row per zone and each of `+2h`, `+6h`, and `+24h`. The `live_score_l` is a relative, bounded prioritization index, not a probability and not calibrated.

The explainable calculation combines saturated recent-event count, distinct-event count, and weighted amount-band activity; exponentially discounts older events; propagates each source-zone signal by `exp(-distance_km / distance_decay_km)` between catalogue centroids; then applies the configured horizon multiplier and maps total intensity through `1 - exp(-intensity)`. No ATM/person locations are inferred. Parameters and the `tracepoint-live-risk-v1` ruleset identifier live together in `live_risk_config.py`.

Rows include event time, scoring `as_of`, freshness, provenance, source-zone coverage, and a quality state. Missing/ineligible evidence produces `live_score_l: null`, not a zero-risk claim. Feature snapshots after `as_of` are excluded. This ruleset is a transparent demo heuristic; its values are not empirically calibrated or a claim of operational accuracy.

Run the focused tests with `python -m pytest -p no:cacheprovider ml/tests/test_live_risk.py`.

## Fused Prediction Service

`prediction_service.py` validates and loads the registered Gradient Boosting model, preprocessing artifact, and saved feature contract. It rebuilds the model's 24-hour inputs from accepted events available by `as_of` (both event and receipt time), requests `L` from the live-risk engine, then returns one deterministic prediction row per zone/horizon. Null/missing live or historical components leave `F` null and unranked. H remains an uncalibrated raw model score; F is a prioritization index, not a probability. `uncertainty` remains null because no validated uncertainty estimate is available.

`prediction_config.py` holds the initial demo fusion weights and versioned risk bands in one place. Weights `(H, L)` are `+2h=(0.45, 0.55)`, `+6h=(0.60, 0.40)`, and `+24h=(0.75, 0.25)`: the demo emphasizes live evidence at shorter horizons. These are transparent starting values, not field-validated or calibrated weights. Bands are `LOW >= 0`, `MEDIUM >= 0.25`, `HIGH >= 0.50`, and `CRITICAL >= 0.75`; they are review-priority categories only.

The backend exposes `POST /api/v1/predictions`; see `backend/README.md` for a request example. The default catalogue and registered model are synthetic, so resulting predictions are visibly marked `synthetic_only: true` with `SYNTHETIC` provenance. Test the complete prediction layer with `python -m pytest -p no:cacheprovider ml/tests backend/tests`.
