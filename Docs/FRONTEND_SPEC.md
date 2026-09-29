# TracePoint — Frontend Product & UX Specification

**Purpose:** Rebuild the TracePoint frontend as a polished investigator console without changing the existing backend/ML contracts unless a UX requirement exposes a genuine backend gap.

## 1. Design Direction

TracePoint should feel like a professional intelligence/investigation console, not a generic admin dashboard.

Use the strongest visual/interaction ideas observed in reference projects as inspiration:
- command-console style shell
- map-first risk analysis
- per-zone evidence/dossiers
- live activity feed
- explicit forecast horizons
- alert lifecycle/timeline

Do not copy reference-project code or assets unless their license/permission clearly permits reuse. Public availability alone is not a reuse license.

## 2. Core User Journey

```text
Open TracePoint
    ↓
Select jurisdiction / case context
    ↓
Review current forecast
    ↓
Inspect top zone
    ↓
Compare Historical vs Live vs Fused Risk
    ↓
Change horizon (+2h / +6h / +24h)
    ↓
Inject/receive new signal
    ↓
Observe ranking change
    ↓
Inspect evidence + freshness
    ↓
Prepare alert
    ↓
Review alert
    ↓
MST/BridgeKey publish (real or demo mode)
    ↓
Track acknowledgement / response / resolution
```

The UI must support this sequence without requiring the user to jump through unrelated screens.

## 3. Application Shell

### Left sidebar

Sections:
1. Overview
2. Risk Map
3. Investigation
4. Alert Workflow
5. Activity Log

Bottom:
- environment label: `SYNTHETIC DEMO`
- connected wallet state
- system health
- version

### Top bar

- TracePoint logo/name
- current workspace/jurisdiction
- case selector or case reference
- `As of` timestamp
- refresh button
- live connection indicator
- BridgeKey wallet status

Do not expose sensitive account identifiers in the visible demo.

## 4. Overview Screen

### A. Header

Title:
`Investigator Desk`

Subtitle:
`Predictive cash-out intelligence`

Show:
- jurisdiction
- as-of time
- data provenance banner
- backend/live status

### B. Forecast summary cards

Three cards:

`+2h`
`+6h`
`+24h`

Each shows:
- top-ranked zone
- risk band
- fused index
- freshness

Clicking a card changes the active horizon.

### C. Main intelligence area

Use a 60/40 split:

Left:
- interactive risk map
- zone markers / heat areas
- selected horizon
- map legend

Right:
- `Priority Zones`
- rank
- zone
- fused risk
- historical contribution
- live contribution
- freshness

Clicking a zone opens the evidence drawer.

### D. Live signal rail

Show the latest accepted signals:
- timestamp
- signal type
- zone
- amount band
- category
- provenance

New events should appear at the top.

## 5. Risk Map Screen

This is the main investigation workspace.

### Map controls

- horizon: +2h / +6h / +24h
- layer: Historical / Live / Fused
- data source/provenance
- risk-band filter
- freshness filter

### Map visual semantics

Observed signals:
- small neutral event markers

Historical risk:
- zone shading

Live risk:
- pulsing/intensity markers

Fused forecast:
- primary heat/priority layer

Do not display unsupported exact-person or exact-ATM predictions.

### Selected-zone side panel

Show:

```text
Zone A
Rank #1

Fused Risk      HIGH
Historical      0.55
Live            0.90

Forecast        +2h
Freshness       CURRENT
Model           GB-v1

Why this zone?
• recent related signals
• strong current activity
• historical similarity
• spatial proximity
```

Then:
- `Review Evidence`
- `Prepare Alert`

## 6. Investigation Screen

Purpose: let the investigator understand the case before acting.

### Sections

#### Case Context
- opaque case reference
- fraud category
- amount band
- jurisdiction
- received time
- provenance

#### Intelligence Summary
- current top zones
- horizon comparison
- historical vs live contribution

#### Signal Timeline
Chronological stream of relevant incoming events.

#### Evidence
Expandable explanation factors with timestamps.

#### Data Quality
- freshness
- coverage
- provenance
- missing inputs
- degraded/stale state

#### Decision panel
Buttons:
- Monitor
- Request Verification
- Dismiss
- Prepare Alert

Avoid language implying guilt or certainty.

## 7. Alert Workflow Screen

This is the blockchain handoff.

### Alert list

Columns:
- Alert ID
- Zone
- Horizon
- Risk Band
- State
- Published time
- Expiry
- Chain status

### Alert details

Show lifecycle:

```text
Draft
  ↓
Published
  ↓
Acknowledged
  ↓
Action Committed
  ↓
Resolved
```

Also support:
- Expired
- Disputed

### Action area

Before Testnet funding:
- `Demo Publish`
- `Demo Acknowledge`
- `Demo Commit`
- `Demo Resolve`

When MST Testnet is configured:
- `Connect BridgeKey`
- `Publish on MST`
- `Acknowledge`
- `Commit Response`
- `Resolve / Dispute`

Never show or request private keys/seed phrases.

## 8. Activity Log

Unified timeline:

```text
10:02  Signal ingested
10:03  Worker processed event
10:03  Live risk recalculated
10:03  Zone ranking changed
10:04  Investigator reviewed Zone A
10:05  Alert prepared
10:06  MST publication signed
10:06  Chain confirmation received
```

Each event should show:
- timestamp
- action
- actor/session
- target
- provenance
- transaction hash where applicable

## 9. Demo Mode

The UI must have a clear local demo mode.

### Suggested demo controls

`Run Demo Scenario`

or retain the existing:

`Simulate Synthetic Event`

A demo scenario should:

1. establish baseline ranking
2. show top zone
3. inject a new synthetic signal
4. process it
5. refresh predictions
6. show ranking change
7. open evidence
8. prepare an alert
9. run mock blockchain lifecycle

Do not hard-code fake prediction numbers into the UI. The existing backend should remain the source of truth.

## 10. Visual System

### Tone

- dark investigator-console base for navigation/map areas
- clean light content panels or carefully controlled dark panels
- strong hierarchy
- restrained use of alert colors
- monospaced treatment only for technical metadata
- generous spacing
- minimal decorative animation

### Status semantics

Risk:
- LOW
- MEDIUM
- HIGH
- CRITICAL

System:
- CURRENT
- STALE
- DEGRADED
- UNAVAILABLE

Blockchain:
- NOT CONFIGURED
- DEMO MODE
- PENDING SIGNATURE
- CONFIRMED
- FAILED

### Typography

Use a modern sans-serif for primary UI and a mono font only for:
- IDs
- timestamps
- model versions
- transaction hashes

## 11. Component Structure

Suggested:

```text
frontend/src/
├── components/
│   ├── app/
│   ├── layout/
│   ├── forecast/
│   ├── map/
│   ├── evidence/
│   ├── signals/
│   ├── alerts/
│   ├── blockchain/
│   └── common/
├── pages/
│   ├── OverviewPage.tsx
│   ├── RiskMapPage.tsx
│   ├── InvestigationPage.tsx
│   ├── AlertsPage.tsx
│   └── ActivityPage.tsx
├── services/
│   ├── api.ts
│   ├── alertWorkflow.ts
│   └── blockchain.ts
├── state/
└── styles/
```

Keep data fetching separate from visual components.

## 12. Backend Contract Preservation

The frontend should consume the existing concepts:
- prediction set
- zone
- historical score
- live score
- fused score
- horizon
- rank
- risk band
- provenance
- freshness/data quality
- explanation
- event ingestion
- alert draft

Do not redesign the backend just to make the UI attractive.

Only request backend changes when a user-facing requirement cannot be satisfied by existing APIs.

## 13. Responsive Behavior

Desktop is the primary hackathon target.

At desktop:
- persistent navigation
- map + intelligence panel side by side

At narrower widths:
- collapsible navigation
- map becomes primary
- evidence becomes a drawer/bottom sheet
- forecast cards become horizontal scroll

Mobile is not a primary feature unless time remains.

## 14. Accessibility & Reliability

- clear focus states
- keyboard-friendly controls
- no information conveyed only by color
- empty/error/loading states for every API-backed region
- preserve synthetic-data warning
- never leave a broken blank screen
- provide explicit retry actions

## 15. MVP Priority

### Must have
- polished Overview
- Risk Map
- zone evidence
- horizon switching
- live event simulation
- visible ranking change
- alert workflow
- activity timeline
- synthetic provenance/status

### Should have
- investigation page
- richer map layers
- demo scenario automation
- chain confirmation timeline

### Later
- advanced transaction graph visualization
- fine-grained cash-point candidate ranking
- production authentication/authorization UI
- mobile-specific experience
- advanced analytics workspace

## 16. Definition of Done

The frontend is ready when a reviewer can:

1. understand the product in 10 seconds
2. see the current top cash-out zones
3. understand why a zone is ranked highly
4. change forecast horizon
5. observe a new signal change the ranking
6. inspect evidence and freshness
7. prepare an alert
8. follow the alert lifecycle
9. see the blockchain/demo status
10. distinguish synthetic prototype behavior from real operational data

The frontend must make the same product claims as the backend: ranked zone-level decision support, not guaranteed exact ATM/person prediction.