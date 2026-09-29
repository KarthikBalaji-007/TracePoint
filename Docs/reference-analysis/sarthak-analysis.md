# Reference Analysis: sarthak-sih

Repository: `references/sarthak-sih`  
Assessment basis: checked-in source, bundled data, and repository documentation. This is a static code review; runtime behavior was not exercised.

## 1. Overall Architecture

Three-tier decision-support application: offline synthetic-data generation and model training; a FastAPI REST service backed by SQLAlchemy/SQLite; and a React dashboard. The model is loaded by the backend for scenario scoring and batch area ranking. There is no message broker or streaming ingestion tier.

## 2. Backend Technology and Structure

Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2, and SQLite. `backend/app/main.py` creates tables at startup and mounts versioned routers. `backend/app/api/v1/` separates predictions, areas, dashboard, analytics, model metrics, settings, audit, and auth; `models/` and `schemas/` hold ORM and request/response types. Prediction inference is implemented in `ml/pipeline/predict.py` and invoked from the API. Although security/RBAC modules and older architecture prose describe authenticated roles, the current README and `AUTH_REMOVAL.md` say the shipped application is public-access; the UI/API should be treated as unauthenticated in this checked-in configuration.

## 3. Frontend Technology and Structure

React 18, TypeScript, Vite, Tailwind CSS, Leaflet, Recharts, and Lucide. `frontend/src/App.tsx` selects pages; `pages/` contains dashboard, predictions, risk map, analytics, model insights, audit logs, and settings. `services/api.ts` wraps REST calls, while `types/index.ts` defines API contracts. The UI is an investigator/analyst console, not a complaint intake application.

## 4. Data Pipeline

`ml/data_generator/generate_synthetic_data.py` creates 100 area records and 15,000 synthetic complaints with a fixed seed. `ml/pipeline/eda_and_clean.py` validates/derives fields, emits cleaned CSV and EDA summaries; `ml/pipeline/train.py` fits preprocessing and candidate models and stores model, preprocessor, and metadata under `ml/saved_models/`. `database/seed_data.py` separately seeds the operational database with areas and complaints. Thus the offline training files and runtime database are related demo artifacts, not a continuously synchronized production pipeline.

## 5. ML/Prediction Methodology

Supervised binary classification estimates cash-withdrawal-event probability. Logistic Regression, Random Forest, and Gradient Boosting are compared using a chronological 80/20 split; preprocessing is fit on the training partition, label-derived columns are guarded against leakage, and model selection uses ROC-AUC with a stated tie preference for the simpler candidate. `predict.py` uses the saved model's `predict_proba`; batch inference ranks candidate zones for a supplied time. README-reported ROC-AUC is around 0.73 on the synthetic out-of-time split. Confidence intervals are heuristic margins around one model probability, not statistically calibrated predictive intervals.

## 6. Features Used for Prediction

Numerical: previous incident count, ATM/POS density, report delay, transaction amount, cyclic hour/day sine and cosine, explicit night-window and weekend flags, and area baseline risk. Categorical: transaction type, complaint category, and amount bucket. The generator retains `label_generation_prob` for auditability but excludes and asserts against it in training. Runtime batch/dashboard paths sometimes derive prior incident count from baseline risk (`baseline_risk_score * 15`) rather than a live rolling count, so those values are proxies.

## 7. Spatial/GIS Implementation

Zones have WGS84 centroid coordinates, radius, administrative labels, ATM/POS density, and baseline risk in `data/synthetic_areas.*` and the Area model. Incident points are jittered around zone centroids. `frontend/src/pages/RiskMapPage.tsx` renders area/incident risk with Leaflet; spatial unit is primarily a predefined surveillance area, not learned clusters or a road-network location. No spatial database, geofencing service, or travel-time routing is present.

## 8. Temporal/Event-Processing Implementation

Offline training sorts timestamps for out-of-time evaluation. Feature engineering encodes hour and weekday cyclically and adds a 21:00–04:00 flag. The area detail endpoint and predictor produce patrol windows, and some area time-window charts are derived from baseline risk with fixed multipliers. There is no streaming event processor, event-time watermarking, late-arrival handling, or online feature store.

## 9. Risk-Scoring Methodology

The primary incident/area score is the model probability, classified using configurable thresholds and accompanied by recommended action/window. `predict.py` computes local counterfactual-ablation contributions by resetting one feature to its training baseline and rescoring; this is not SHAP. The area record also carries a separate synthetic standing baseline score. These quantities must not be conflated. The reported interval and suggested patrol action are decision-support heuristics, not ground-truth certainty.

## 10. Real-Time Functionality

Synchronous REST inference is available when a request arrives, but there is no live financial-transaction feed, streaming push, or automatic model retraining. Dashboard alerts are synthesized from the seeded areas, current hour, and configured thresholds; “live” means recalculated on API reads rather than events arriving from an external operational source.

## 11. Dashboard/Investigator Workflow

The landing dashboard summarizes seeded complaints, withdrawal events, risk zones, and alerts. Investigators can inspect ranked predictions, open area details and the Leaflet risk map, and review analytics/model metrics. Settings expose score thresholds and audit records capture API actions. There is no implemented end-to-end complaint intake, case assignment, patrol dispatch, or intervention outcome feedback loop. Despite auth-related modules, public access is the current documented behavior.

## 12. Data Sources

Checked-in synthetic CSV/JSON and deterministic seed data only. Coordinates are illustrative regional centers and generated jitter; the README and data dictionary explicitly state there is no real PII. No NCRP, bank, UPI, ATM-provider, police, or external geospatial feed is integrated.

## 13. Synthetic/Simulated Components

All training and demonstration complaints, event labels, zone risk, ATM/POS counts, coordinates, and seeded operational records are synthetic. Labels are drawn from a generated risk process, so evaluation measures recovery of that simulation rather than field performance. Alerts, dashboard time-window summaries, and some history counts are also derived from seed/baseline values.

## 14. Important Files by Feature

- Architecture and caveats: `README.md`, `docs/ARCHITECTURE.md`, `AUTH_REMOVAL.md`
- Synthetic input: `ml/data_generator/generate_synthetic_data.py`, `data/synthetic_areas.json`, `data/synthetic_complaints.csv`
- Cleaning/EDA/training/inference: `ml/pipeline/eda_and_clean.py`, `ml/pipeline/train.py`, `ml/pipeline/predict.py`
- API/database: `backend/app/main.py`, `backend/app/database.py`, `backend/app/api/v1/predictions.py`, `areas.py`, `dashboard.py`, `analytics.py`
- UI: `frontend/src/App.tsx`, `frontend/src/pages/RiskMapPage.tsx`, `PredictionsPage.tsx`, `DashboardOverview.tsx`, `frontend/src/services/api.ts`
- Seeding/governance: `database/seed_data.py`, `backend/app/core/audit_logger.py`, `backend/app/api/v1/audit.py`

## 15. Strengths

- Clear separation of data generation, cleaning, training, inference, API, and presentation.
- Reproducible synthetic dataset and explicit train/test time ordering.
- Feature leakage checks are encoded as executable training guards.
- Model comparison includes a trivial baseline and ROC-AUC rationale.
- Counterfactual explanation output is case-specific and its method is named.
- API schemas, modular routers, area map, analytics, and audit UI make a coherent prototype.

## 16. Weaknesses

- Synthetic labels and inputs cannot establish real-world calibration, utility, or geographic validity.
- Runtime history/velocity values can be generated from a static baseline rather than observed events.
- No ingestion connectors, event-time state, streaming infrastructure, intervention feedback, or production model monitoring.
- Fixed-zone centroids and Leaflet visualization do not predict a specific terminal or cash-out path.
- Approximate confidence intervals are not calibrated uncertainty; time-window recommendations include rules beyond the model.
- Public access conflicts with role-based design descriptions and is unsuitable for sensitive operational data.
- SQLite/startup schema creation and lack of a migration workflow limit multi-user production deployment.

## 17. What Is Useful for TracePoint

- Keep an explicit request-time feature contract and fail training when target-derived fields leak in.
- Use chronological validation and report ranking/calibration metrics against simple baselines.
- Separate incident probability, zone prior, confidence/uncertainty, and operational threshold decisions in APIs and UI.
- Reuse the modular model/API/dashboard boundaries, typed schemas, local explanation pattern, and auditable prediction record concept.
- Treat zones as operational entities with metadata, then connect live rolling counts and cash-point inventory to those entities.

## 18. What Should Not Be Adopted

- Do not present synthetic-data scores as evidence of field accuracy or make generated zone scores look like measured intelligence.
- Do not use baseline-derived substitutes as if they were live incident velocity.
- Do not describe a heuristic interval or manually selected patrol window as model confidence/forecast output.
- Do not deploy public unauthenticated access for sensitive complaint or investigator data.
- Do not treat centroid heatmaps as specific cash-out-location prediction or infer a person/account is culpable from a risk score.
