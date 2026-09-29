# TracePoint — Project Progress

**Last audited:** 2026-09-29  
**Canonical project root:** `C:\Karthik\Engg\Projects\MST\TracePoint\`

> This file records the current state based on the latest workspace inspection and implementation work. It must be updated after each major implementation phase.

---

# 1. Current Status

## Overall

**Core predictive intelligence:** substantially implemented  
**Investigator dashboard:** substantially implemented  
**Blockchain/MST layer:** not implemented yet  
**Current runtime blocker:** prediction endpoint import failure  
**Demo readiness:** blocked until prediction endpoint is stabilized

---

# 2. Repository Structure

## Canonical implementation

```text
TracePoint/
├── backend/
├── frontend/
├── ml/
└── Docs/
```

This is the actual active TracePoint implementation.

## References

```text
TracePoint/references/
├── cyber-x/
├── nirikshan/
└── sarthak-sih/
```

These are external/reference projects used for study and architectural comparison.

## Stale scaffold

```text
TracePoint/tracepoint/
├── backend/       empty
├── blockchain/    empty
├── data/          empty
├── docs/          reference-analysis files
├── frontend/      empty
└── ml/            empty
```

This nested scaffold should be removed after preserving its reference-analysis documents.

---

# 3. Verified Existing Implementation

## Architecture & documentation

- [x] System architecture defined
- [x] Off-chain/on-chain separation defined
- [x] Investigator workflow defined
- [x] MST alert lifecycle defined
- [x] Data model defined
- [x] Provenance model defined
- [x] Synthetic-data disclaimer defined

## Backend

- [x] FastAPI application exists
- [x] Event ingestion
- [x] Input validation
- [x] Idempotency
- [x] SQLite persistence
- [x] Durable event queue
- [x] Worker processing
- [x] Replay support
- [x] Live feature endpoint
- [x] Prediction endpoint
- [x] Alert workflow boundary
- [x] CORS/local frontend support

## ML

- [x] Synthetic data generation
- [x] Historical training example generation
- [x] Cutoff-safe feature construction
- [x] Chronological train/validation/test methodology
- [x] Baseline model comparison
- [x] Gradient Boosting artifact
- [x] Model metadata
- [x] Live spatio-temporal risk
- [x] Temporal recency handling
- [x] Spatial distance influence
- [x] +2h horizon
- [x] +6h horizon
- [x] +24h horizon
- [x] Historical + live fusion
- [x] Zone ranking
- [x] Prediction explanations/provenance

## Frontend

- [x] React/Vite dashboard
- [x] Investigator-oriented layout
- [x] Forecast controls
- [x] Risk ranking
- [x] Synthetic zone map
- [x] Zone evidence area
- [x] Event simulator
- [x] Freshness/provenance display
- [x] Application-side alert draft workflow

---

# 4. Current Runtime Problem

The frontend loads, but the prediction API currently fails.

Observed:

```text
POST /api/v1/predictions
→ 500 Internal Server Error
```

Root cause:

```text
ModuleNotFoundError: No module named 'ml'
```

Failure location:

```text
backend/app/main.py
from ml.prediction_service import format_time, parse_as_of
```

The live-features endpoint was returning:

```text
GET /api/v1/live-features
→ 200 OK
```

Therefore the immediate issue is package/import configuration rather than proof that the prediction model itself is broken.

## Required fix

- [ ] Make root-level `ml/` importable from the backend reliably
- [ ] Make model/data paths robust
- [ ] Document canonical startup
- [ ] Re-test prediction endpoint

---

# 5. Testing State

The workspace contains:

### Backend test suites
- `test_ingestion.py`
- `test_live_processing.py`
- `test_prediction_api.py`

### ML test suites
- `test_live_risk.py`
- `test_prediction_service.py`
- `test_synthetic_data.py`
- `test_training_baseline.py`

### Frontend
- Vitest component/integration test suite

**Current requirement:** rerun the full suite after the import/startup fix and record the exact current passing count here.

---

# 6. Blockchain State

## Current

- [ ] Solidity contract
- [ ] Local contract deployment
- [ ] Contract lifecycle tests
- [ ] Blockchain adapter
- [ ] MST configuration
- [ ] BridgeKey integration
- [ ] Mock blockchain mode
- [ ] Chain indexer
- [ ] MST Testnet deployment
- [ ] Real Testnet transaction

The architecture and data model define the required alert lifecycle, but no blockchain implementation currently exists in the repository.

---

# 7. Required MST Lifecycle

```text
PUBLISHED
    ↓
ACKNOWLEDGED
    ↓
ACTION_COMMITTED
    ↓
RESOLVED
```

Alternate valid paths:

```text
PUBLISHED → EXPIRED
PUBLISHED → DISPUTED
ACKNOWLEDGED → DISPUTED
ACTION_COMMITTED → EXPIRED
DISPUTED → RESOLVED
DISPUTED → EXPIRED
```

MST should record coordination/audit metadata only.

Sensitive case details remain off-chain.

---

# 8. Testnet Funding Dependency

## Can be completed now without funds

- [ ] Contract source
- [ ] Contract unit tests
- [ ] Local deployment
- [ ] Blockchain adapter
- [ ] Mock mode
- [ ] BridgeKey connection abstraction
- [ ] Transaction-building flow
- [ ] Chain event indexer
- [ ] UI lifecycle
- [ ] Documentation

## Requires funded MST Testnet wallet

- [ ] Real contract deployment
- [ ] Real on-chain publication
- [ ] Real lifecycle signature
- [ ] Final transaction verification
- [ ] Final contract address
- [ ] Final verifiable transaction hash

---

# 9. Reference Project Usage

Reference repositories studied:

- CYBER-X
- NIRIKSHAN
- Sarthak SIH project

TracePoint's current implementation is in the canonical root and the nested reference scaffold contains no active implementation.

Useful concepts from references have been reimplemented in the TracePoint architecture, including:
- historical zone-level scoring
- live event processing
- spatial/temporal propagation
- future forecast horizons
- investigator-oriented visualization

No reference repository should be modified as part of this build.

---

# 10. Current Product Demo

Target live demonstration:

```text
1. Open TracePoint
2. Select synthetic jurisdiction
3. Show baseline ranking
4. Open top zone
5. Show historical risk
6. Show live risk
7. Show fused risk
8. Show evidence
9. Show freshness
10. Show model version
11. Inject new synthetic event
12. Process event
13. Refresh prediction
14. Show ranking change
15. Review evidence again
16. Prepare alert
17. Show application-side alert
18. Later switch to MST/BridgeKey mode
19. Publish/acknowledge/resolve
```

The ranking-change step is the key proof that the live intelligence pipeline is dynamic.

---

# 11. Immediate Work Queue

## P0 — Must fix first

- [ ] Fix `ml` import/path issue
- [ ] Verify `/api/v1/predictions`
- [ ] Verify all three horizons
- [ ] Run complete tests
- [ ] Verify synthetic event changes the ranking
- [ ] Verify the frontend shows the updated prediction

## P1 — Finish cyber-intelligence demo

- [ ] Harden demo scenario
- [ ] Make startup reproducible
- [ ] Improve alert draft usability
- [ ] Ensure evidence/freshness/provenance are obvious

## P1 — Blockchain build

- [ ] Implement MST contract
- [ ] Local contract tests
- [ ] Blockchain adapter
- [ ] Mock mode
- [ ] BridgeKey integration
- [ ] Chain indexer

## P2 — Final Testnet proof

- [ ] Obtain funded MST Testnet wallet
- [ ] Deploy
- [ ] Capture contract address
- [ ] Execute real signed alert transaction
- [ ] Capture verifiable transaction hash
- [ ] Verify on explorer

## P2 — Submission

- [ ] Root Git repository
- [ ] `.gitignore`
- [ ] README
- [ ] Architecture diagram
- [ ] Demo instructions
- [ ] Test results
- [ ] Contract address
- [ ] Testnet transaction reference
- [ ] Final screenshots/video if required

---

# 12. Definition of Done

TracePoint is complete when:

```text
Incoming signal
      ↓
Historical intelligence
      +
Live intelligence
      ↓
Fused future-zone ranking
      ↓
Investigator evidence review
      ↓
Alert
      ↓
BridgeKey signature
      ↓
MST coordination lifecycle
      ↓
Responder status
      ↓
Resolution
```

is demonstrable from one clean project.

The demo must clearly distinguish:
- prediction from certainty
- zone from exact ATM
- intelligence from enforcement
- synthetic data from real operational data
- off-chain evidence from on-chain coordination