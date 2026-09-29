# TracePoint — Complete Implementation Plan

**Project:** TracePoint — Predictive Cybercrime Intelligence & Cash-Out Risk Platform  
**Purpose:** Build a coherent, judge-ready investigator decision-support product that forecasts likely future cash-out zones/time windows, supports human review, and uses MST for authorized alert coordination and auditability.  
**Date:** 2026-09-29

---

## 1. Product Goal

TracePoint is designed as an investigator decision-support system.

The end-to-end product flow is:

```text
Cybercrime / financial intelligence signal
            ↓
Ingestion + validation + provenance
            ↓
Durable event queue
            ↓
Historical intelligence (H)
            +
Live spatio-temporal intelligence (L)
            ↓
Risk fusion (F)
            ↓
Future-zone ranking
(+2h / +6h / +24h)
            ↓
Investigator reviews evidence
            ↓
Alert draft
            ↓
BridgeKey approval
            ↓
MST alert publication
            ↓
Responder acknowledgement
            ↓
Response commitment
            ↓
Resolution / expiry / dispute
```

The system must not claim to identify a person, predict an exact ATM without supporting data, or autonomously trigger enforcement.

---

# 2. Current Architecture

## Core components

### Backend
- FastAPI
- SQLite/off-chain operational persistence
- Event ingestion
- Idempotency
- Durable event queue
- Worker/replay
- Live feature computation
- Prediction API
- Alert workflow boundary

### ML
- Synthetic data generation
- Cutoff-safe supervised historical baseline
- Chronological evaluation
- Registered model artifacts
- Live spatio-temporal scoring
- +2h / +6h / +24h forecast horizons
- Historical + live fusion
- Zone ranking
- Explanation/provenance metadata

### Frontend
- React + TypeScript + Vite
- Investigator dashboard
- Risk rankings
- Zone map
- Evidence panel
- Synthetic event simulator
- Freshness/provenance display
- Application-side alert workflow

### Blockchain
- Not implemented yet
- Architecture and lifecycle defined
- Must be implemented as the remaining buildathon-specific layer
- MST is for coordination/auditability, not prediction storage

---

# 3. Phase 0 — Workspace Canonicalization & Documentation

## What
Establish one clean repository root and remove stale scaffolding.

## Why
The current workspace contains the actual implementation at the root and an empty nested `tracepoint/` scaffold. Continuing without cleanup makes startup paths, Git, and future deployment error-prone.

## How
1. Treat:
   `C:\Karthik\Engg\Projects\MST\TracePoint\`
   as the canonical project root.
2. Keep `references/` read-only.
3. Move the existing reference-analysis markdown files from the nested scaffold into:
   `Docs/reference-analysis/`
4. Remove the empty nested `tracepoint/` directory only after confirming it contains no required implementation.
5. Remove temporary pytest/cache directories after confirming they contain no source code.
6. Create a root `.gitignore`.
7. Initialize/repair Git at the root if required.
8. Do not set or invent a remote URL.
9. Keep secrets, local databases, node_modules, dist, caches and temp fixtures out of Git.

## Done when
- One clear project root exists.
- `backend/`, `frontend/`, `ml/`, `Docs/` are the active project.
- `references/` remains untouched.
- No empty duplicate implementation tree remains.
- Git status is understandable.
- Documentation is under root `Docs/`.

---

# 4. Phase 1 — Runtime & Import Stabilization

## What
Make the current application run reliably from the canonical root.

## Why
The current frontend reaches the backend, but `/api/v1/predictions` currently fails because the backend process cannot import the root-level `ml` package.

## How
1. Inspect Python package structure.
2. Fix the `ml` import path/package configuration robustly.
3. Avoid requiring a one-off terminal `PYTHONPATH` workaround.
4. Normalize model/data/artifact paths so they do not depend on the current working directory.
5. Document one canonical backend startup command.
6. Verify CORS and frontend API base URL.
7. Verify database initialization/seeding.
8. Verify the model artifacts are found from the canonical startup method.

## Done when
- `/health` → 200
- `/api/v1/live-features` → 200
- `/api/v1/predictions` → 200
- All three horizons work.
- Prediction response contains H/L/F, rank, risk band, provenance, freshness/data quality, model version and explanation.

---

# 5. Phase 2 — End-to-End Prediction Verification

## What
Prove that TracePoint is genuinely dynamic.

## Why
A static prediction screen is weak in a review. The strongest proof is:

```text
new signal
→ live processing
→ changed live risk
→ changed fused risk
→ changed zone ranking
```

## How
Verify:

1. Synthetic event enters ingestion.
2. Event receives provenance.
3. Event is queued.
4. Worker processes it.
5. Live feature state changes.
6. Prediction service recomputes.
7. H/L/F values update.
8. Zone ranking can change.
9. Evidence explains the new ranking.
10. Freshness reflects the new event.

## Done when
A reviewer can watch a simulated event change the forecast without manually editing the database.

---

# 6. Phase 3 — Investigator Experience & Demo Hardening

## What
Turn the working intelligence engine into a smooth investigation workflow.

## Why
The product must be demonstrated while being explained. The UI must support a continuous story rather than disconnected screens.

## Required UX
- Synthetic-data banner remains visible.
- Jurisdiction selector.
- Forecast horizon selector.
- Ranked candidate zones.
- Risk map.
- Historical Risk.
- Live Risk.
- Fused Risk.
- Rank.
- Evidence/explanation.
- Freshness.
- Model version.
- Data provenance.
- Zone-level limitations.
- Alert draft.

## Preferred demo helper
Add a safe local-only “Run Demo Scenario” flow if practical:

```text
Initial state
    ↓
Inject signal A
    ↓
Show baseline ranking
    ↓
Inject stronger signal B into another zone
    ↓
Refresh
    ↓
Show ranking change
```

This should use the existing synthetic pipeline rather than hard-coded UI numbers.

## Done when
The entire cyber-intelligence demonstration can be completed reliably in a few minutes from a clean start.

---

# 7. Phase 4 — MST Smart Contract

## What
Implement the real on-chain alert coordination contract.

## Why
MST is a mandatory buildathon requirement and must have a meaningful role.

## Contract lifecycle

```text
PUBLISHED
    ↓
ACKNOWLEDGED
    ↓
ACTION_COMMITTED
    ↓
RESOLVED
```

Supported alternate paths:

```text
PUBLISHED → EXPIRED
PUBLISHED → DISPUTED
ACKNOWLEDGED → DISPUTED
ACTION_COMMITTED → EXPIRED
DISPUTED → RESOLVED
DISPUTED → EXPIRED
```

## On-chain data
Only minimal coordination metadata:
- Opaque alert ID
- Coarse zone/jurisdiction ID
- Horizon
- Risk band
- Expiry/deadline
- Model/fusion version
- Salted prediction snapshot commitment
- Authorized wallet addresses
- Lifecycle state/timestamps
- Event/transaction references

## Never put on-chain
- Names
- Account/card/UPI identifiers
- Exact transaction details
- Exact coordinates
- ATM tactical details
- Evidence files
- Model features
- Detailed investigation notes
- Credentials

## Done when
- Contract compiles.
- Contract tests pass.
- Role checks pass.
- Invalid transitions revert.
- Events are emitted for lifecycle transitions.
- Local deployment works.

---

# 8. Phase 5 — Blockchain Adapter & Mock Mode

## What
Connect the application to the contract without making the product dependent on Testnet funds.

## Why
Development and demo work must continue even while the Testnet wallet/faucet issue is unresolved.

## How
Implement:

```text
Alert UI
   ↓
Blockchain adapter
   ├── DEMO/MOCK MODE
   └── MST TESTNET MODE
```

The adapter should receive configuration from environment variables.

Expected configuration:
- RPC endpoint
- Chain ID
- Contract address
- network/mode
- explorer base URL

Do not invent fake contract addresses or transaction hashes.

## Demo mode
The complete alert lifecycle must be demonstrable locally without broadcasting.

## Real mode
The same UI/workflow calls the MST Testnet adapter and requests BridgeKey signing.

## Done when
- Mock lifecycle works end-to-end.
- Switching modes does not require rewriting application code.

---

# 9. Phase 6 — BridgeKey Integration

## What
Use BridgeKey for user-approved MST signing.

## Why
The buildathon recommends a non-custodial wallet flow and the application must not hold private keys.

## Rules
- Never request seed phrases.
- Never request private keys.
- Never request wallet passwords.
- Backend prepares transaction data.
- BridgeKey signs from the user's wallet.
- Wallet ownership is not treated as a substitute for application authorization.

## Done when
At least the following actions can request user signatures:
- publish alert
- acknowledge alert
- commit response
- resolve/dispute as authorized

---

# 10. Phase 7 — Chain Event Indexer

## What
Read MST contract events and reconcile them back into the TracePoint application.

## Why
The investigator UI should show the blockchain-backed workflow status instead of relying only on local state.

## How
```text
MST contract
    ↓
Events
    ↓
Indexer
    ↓
Off-chain projection
    ↓
Investigator UI
```

Track:
- transaction hash
- block/confirmation information
- alert ID
- actor wallet
- state transition
- timestamps

## Done when
Publishing/acknowledgement/etc. on MST can be reflected back in the dashboard.

---

# 11. Phase 8 — MST Testnet Deployment

## What
Deploy the contract to MST Testnet and produce real verifiable evidence.

## Current blocker
Testnet funding/credentials are not available yet.

## What can be done before funding
- Contract source
- Local tests
- Adapter
- Mock mode
- BridgeKey integration layer
- Indexer
- Configuration
- Documentation

## Final funded-wallet steps
1. Connect BridgeKey to MST Testnet.
2. Confirm Testnet MSTC.
3. Deploy contract.
4. Record contract address.
5. Publish a real alert.
6. Sign a real lifecycle transition.
7. Record transaction hash.
8. Verify transaction on the MST explorer.
9. Put contract address + real TX reference in README/submission evidence.

---

# 12. Phase 9 — Security & Data Handling

Verify before submission:
- synthetic provenance is propagated
- no PII on-chain
- no private keys in source
- no secrets committed
- invalid roles cannot perform lifecycle actions
- invalid state transitions revert
- exact locations stay off-chain
- synthetic performance is clearly labelled
- model scores are not presented as calibrated probabilities unless calibration exists
- no autonomous enforcement behavior

---

# 13. Phase 10 — Final Validation & Presentation

## Technical acceptance test

Run:

```text
Start backend
    ↓
Start frontend
    ↓
Load dashboard
    ↓
Generate baseline forecast
    ↓
Inject synthetic event
    ↓
Process worker
    ↓
Refresh forecast
    ↓
Observe ranking change
    ↓
Inspect evidence
    ↓
Create alert
    ↓
Mock MST publish
    ↓
Acknowledge
    ↓
Commit response
    ↓
Resolve
```

Then separately verify real MST Testnet mode when funded.

## Final presentation story

1. Cybercrime case arrives.
2. Existing financial intelligence establishes relevant fraud flow/account context.
3. TracePoint receives authorized signals.
4. Historical intelligence provides long-term pattern.
5. Live intelligence captures what is changing now.
6. Fusion ranks candidate zones.
7. +2h/+6h/+24h provide configurable forecast windows.
8. Investigator examines evidence, freshness and model version.
9. Investigator decides whether the forecast is actionable.
10. Alert is prepared.
11. BridgeKey signs.
12. MST records coordination.
13. Responder acknowledges/commits/resolves.
14. Outcome is recorded for later evaluation.

---

# 14. Explicit Non-Goals for This Build

Do NOT add these to the critical path:

- GNN just for novelty
- exact ATM prediction without authorized ATM-level data
- exact suspect movement tracking
- autonomous police/financial action
- real NCRP/bank integration without authorization
- public storage of sensitive investigation data
- token incentives
- fake blockchain transactions

A future production version may add transaction-graph features and finer candidate cash-point ranking once sufficient authorized data exists.

---

# 15. Definition of Done

TracePoint is considered submission-ready when:

- [ ] One canonical clean repository exists
- [ ] Backend starts reliably
- [ ] Frontend starts reliably
- [ ] Prediction API works
- [ ] Historical risk works
- [ ] Live risk works
- [ ] Fused risk works
- [ ] +2h/+6h/+24h work
- [ ] New events can change the ranking
- [ ] Evidence/freshness/provenance are visible
- [ ] Investigator alert workflow works
- [ ] MST contract exists and is tested
- [ ] Mock blockchain lifecycle works
- [ ] BridgeKey integration works
- [ ] MST Testnet deployment is complete
- [ ] At least one real Testnet transaction is verifiable
- [ ] Chain events can be indexed/reconciled
- [ ] No sensitive data is placed on-chain
- [ ] Tests pass
- [ ] README is complete
- [ ] Demo can be run from a clean environment
- [ ] Presentation and live demo tell the same end-to-end story