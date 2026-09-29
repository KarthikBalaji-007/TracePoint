# Reference Analysis: nirikshan

Repository: `references/nirikshan`  
Assessment basis: checked-in source, bundled web build/data, and README. This is a static code review; runtime behavior was not exercised.

## 1. Overall Architecture

NIRAKSHAN is a prototype console with a custom Python HTTP server, a legacy static JavaScript application, and a newer React/Vite application in `webapp/`. The server exposes ingestion and scoring endpoints, stores recent events in SQLite/in-memory structures, and broadcasts Server-Sent Events (SSE). The React app consumes that stream and computes live terminal/zone rankings in the browser. A separately bundled `webapp/dist` exists, alongside `public/index.html` and legacy scripts, so the served UI depends on static-serving selection in `app.py` rather than a single clean frontend entry point.

## 2. Backend Technology and Structure

`app.py` uses Python standard-library `HTTPServer`/request handling and SQLite, not Flask or FastAPI. It owns routes for `/events`, `/ingest`, `/sms`, `/qr/verify`, `/atms`, `/case/trace`, `/ai/briefing`, and `/health`, static serving, rate limiting, SMS/QR rule engines, and simulator behavior. Events are persisted in a local SQLite connection while recent-event/client state is held in process memory. Optional notifications use ntfy/Telegram environment configuration. This is a compact prototype server with substantial responsibilities in one module.

## 3. Frontend Technology and Structure

Two generations are present. The React 18/Vite/Tailwind frontend is in `webapp/src`: `app.jsx` and desktop/mobile shells compose views; `context/consolecontext.jsx` holds UI state; `live/uselivefeed.jsx` maintains one EventSource; `lib/` holds API, terminal metadata, Hawkes-style scoring, QR and export utilities; components include the Leaflet terminal map and case/provenance panels. `public/` contains a separate vanilla-JS console (`index.html`, `app.js`, `live.js`, `chase.js`, etc.). The existence of both implementations and generated `dist` increases risk of source/build drift.

## 4. Data Pipeline

`generate_data.py` creates a synthetic complaint/terminal JSON seed with random amounts, timestamps, victim/mule identifiers, and hop counts. `app.py` also simulates events and can accept manual/web or keyed external ingestion. New complaints are recorded locally and broadcast to connected SSE clients; recent events are aggregated for case traces/briefings. ATM lookup can query OpenStreetMap Overpass and cache results, with explicitly labeled seeded fallback data. This is a demo ingestion loop, not a normalized, governed financial-event pipeline.

## 5. ML/Prediction Methodology

The main terminal forecast is deterministic, hand-coded Hawkes-inspired scoring in `webapp/src/lib/hawkes.js`, not a fitted ML model. `evaluateTerminal` combines fixed node baseline score/flow/hops with contributions from other high-baseline nodes using exponential spatial/temporal kernels and an amount mark, then transforms intensity into a bounded score and projected flow. `hawkesIntensity` gives live stream events a hop decay and age decay; `rankTerminals`/`zoneRisk` rank terminal/zone values. These formulas are heuristic adaptations, and the live intensity is separate from the legacy forecast calculation. QR and SMS use rule-based indicators, not learned classifiers.

## 6. Features Used for Prediction

Forecast inputs include hard-coded terminal location, baseline score, baseline flow, baseline hop count, configured alpha/beta/sigma, distance to other hot nodes, their base transaction-flow mark, and the requested forecast horizon. Live intensity additionally uses event terminal ID, hop count, and timestamp/age. Synthetic records include disputed amount, VPA/mule-layer identifiers, hop count, and target terminal. The visible Hawkes formulas do not learn from complaint category, amount, cash-out outcome, ATM capacity, actual withdrawal, or response labels in a historical training set.

## 7. Spatial/GIS Implementation

The terminal inventory is 11 hard-coded city-level nodes in `webapp/src/lib/terminals.js`, with lat/lon and fixed zones. Leaflet renders nodes and terminal risk on an India map, with ESRI/OSM basemaps. Distance calculations use Haversine; the forecast kernel spreads influence with a configured Gaussian-like distance decay. The `/atms` route queries Overpass for real nearby OSM ATM features where available and otherwise returns labeled fallback points. This is terminal/node-level spatial ranking, not learned fine-grained cash-out zone detection; basemap and OSM coverage are external dependencies.

## 8. Temporal/Event-Processing Implementation

The React client uses a single browser `EventSource` to `/events`; the server broadcasts named/JSON events to connected clients. The live-feed hook buffers the newest 250 complaints/anomalies/SMS items and reconnects on failure. Simulator emits events on a timer; ingestion can publish immediately. Event timestamps are often formatted as time-of-day strings, which weakens robust age calculations across dates/time zones. There is no durable broker, partitioning, deduplication, replay, event-time watermark, or distributed consumer state.

## 9. Risk-Scoring Methodology

Terminal baseline risk values and forecast thresholds are hand-authored. `evaluateTerminal` computes baseline-hop-weighted intensity plus high-risk-node spatial/temporal terms, converts to probability and caps score between 12 and 99; `riskColor` maps score bands to colors. Live Hawkes intensity is hop-decayed and age-decayed and then normalized to the top terminal for display. QR scoring sums URI/payee/VPA rules and SMS scoring sums matched text/sender rules, both capped at 99 with fixed verdict thresholds. These outputs are operational heuristics, not calibrated probabilities. The UI's risk display should not be read as model confidence.

## 10. Real-Time Functionality

This is the strongest reference for a demo live loop: simulator/manual/keyed ingestion, SQLite event recording, server-push SSE, live dashboard counters/rankings, anomaly/SMS notifications, live case-trace aggregation, and optional ntfy/Telegram push. ATM inventory enrichment is external and cached with fallback. It is not connected to actual bank/payment rails or a verified complaint platform; real-time behavior is only as real as the configured ingress and seeded simulator.

## 11. Dashboard/Investigator Workflow

The console provides terminal map/rankings and horizon selection, live activity feed, case/money-layer trace, engine-room parameter view, briefing, QR verification, SMS risk screening, and PDF/dossier export. The UI is dense and operationally styled for desktop/mobile shells. Workflows are mostly demo exploration; no full case ownership, role authorization, assignment queue, disposition capture, or intervention outcome loop is evident in the described client/server routes.

## 12. Data Sources

Bundled `public/seed_data.json`, generated demo events, hard-coded `NODES` and `CHASE_SEQ`, manual/keyed web ingestion, optional Telegram/SMS ingress, OSM Overpass ATM lookup, external tile providers, and optional ntfy/Telegram notifications. The AI briefing is constructed from local recent-event/terminal summaries (not evidence of a connected model just because it is called “AI”). The repository does not show authorized NCRP/bank transaction feeds.

## 13. Synthetic/Simulated Components

The complaint stream simulator, seed complaints and identifiers, 11 terminal baselines, base flows/hops, chase sequence, case-trace layers, and risk calibration are illustrative. ATM fallback points are seeded and labeled degraded. SMS/QR “fraud” verdicts are deterministic rules. External Overpass points and map tiles can be real geographic reference data, but their presence does not make complaint events or predicted outcomes real.

## 14. Important Files by Feature

- Server/routes/SSE/SQLite/simulator/scorers: `app.py`
- Synthetic seed creation: `generate_data.py`, `public/seed_data.json`
- Hawkes-inspired forecast and ranking: `webapp/src/lib/hawkes.js`
- Terminal/node metadata and chase sequence: `webapp/src/lib/terminals.js`
- SSE subscription and buffering: `webapp/src/live/uselivefeed.jsx`
- API client: `webapp/src/lib/api.js`
- Map and live console: `webapp/src/components/terminalmap.jsx`, `webapp/src/app.jsx`, `webapp/src/context/consolecontext.jsx`
- Legacy interface: `public/index.html`, `public/app.js`, `public/live.js`, `public/engine_room.js`
- QR/SMS rules: `app.py`, `webapp/src/lib/qr.js`, `public/qr_engine.js`

## 15. Strengths

- A concrete end-to-end event flow demonstrates ingestion, persistence, SSE broadcast, and live UI updates.
- Single shared EventSource and bounded client buffers are simple patterns for a prototype console.
- Terminal metadata, distance calculations, forecast horizons, and map rendering are explicit and inspectable.
- External ATM enrichment has cache/fallback behavior and labels degraded seeded results.
- The UI connects incident trace, terminal views, QR/SMS screening, and operator briefing in one console.

## 16. Weaknesses

- Core cash-out forecasts use static hand-authored node priors and heuristic kernels, with no outcome labels or empirical backtest.
- Fixed city nodes cannot produce defensible address/ATM-level location predictions.
- Time-of-day timestamps and in-process state make event-age correctness, restart recovery, and multi-instance deployment fragile.
- One large standard-library server module mixes persistence, HTTP, scoring, integrations, and static serving.
- Legacy and React frontends coexist with checked-in build output, creating drift and deployment ambiguity.
- External feeds, notifications, browser location, tiles, and OSM service availability are operational dependencies; fallbacks may be mistaken for current data without clear UI provenance.
- Synthetic VPA/mule identifiers and “live” simulator events can imply financial-network access that is not actually present.

## 17. What Is Useful for TracePoint

- Use the event-to-dashboard pattern as a prototype for complaint/transaction signal arrival and operator-visible updates.
- Keep a bounded recent-event view while persisting canonical events separately; add durable broker/storage and replay before operational use.
- Treat terminal/ATM inventory as explicit geospatial entities and tag external, stale, and seeded records with provenance.
- Provide forecast horizons and show which event evidence changed a zone ranking, while labeling heuristic/uncertain output plainly.
- Separate rule-based triage tools (QR/SMS) from learned cash-out prediction and from case evidence.

## 18. What Should Not Be Adopted

- Do not treat the Hawkes-like formula as a validated Hawkes process or describe heuristic ranks as calibrated probabilities.
- Do not rely on static city-level priors as predicted cash-out locations.
- Do not use in-memory SSE client lists and SQLite connection state as a production multi-worker event architecture.
- Do not equate simulator traffic, seeded case traces, fake identifiers, or fallback ATMs with live intelligence.
- Do not use time-only timestamps for durable event ordering or age-based risk calculations.
- Do not ship duplicate legacy/React implementations without an explicit source-of-truth and build process.
