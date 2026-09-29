# TracePoint Investigator Desk

React, TypeScript, and Vite investigator dashboard for the local TracePoint API. It uses the live synthetic zone catalogue, `/api/v1/predictions`, `/api/v1/live-features`, event ingestion, and the explicit worker endpoint. Prediction values are always fetched from the backend; the dashboard does not include demo score fixtures.

## Run locally

In one terminal from the repository root, install the Python requirements and start the API:

```powershell
python -m pip install -r backend/requirements.txt -r ml/requirements.txt
python -m pip install -e .
python -m backend
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` to `http://127.0.0.1:8000`; set `VITE_API_PROXY` if the backend uses another local URL. Local API calls time out after nine seconds. The dashboard shows unavailable/stale states and retains the last successful snapshot if a refresh fails.

The default catalogue/model are synthetic. A persistent red `SYNTHETIC DEMO DATA` banner marks this, event simulation sends only `SYNTHETIC` provenance, and the map plots synthetic zone centroids without incident points or invented boundaries. On an empty synthetic jurisdiction, startup calls the idempotent demo-bootstrap endpoint to add and process one synthetic baseline event, so the initial rankings are real service outputs rather than hard-coded values.

“Publish Alert” prepares a session-only off-chain `DRAFT`. The visible mock lifecycle can advance/dispute/expire local draft state without RPC calls or fabricated transaction records. `frontend/src/services/blockchain/adapters.ts` holds the MST config, contract and event-indexer adapter, salted snapshot commitment, and EIP-1193 wallet signing interface. It never accepts private keys or seed phrases. Do not enable testnet mode until the chain ID is verified and a compatible BridgeKey provider and deployed contract are available.

## Checks

```powershell
npm test
npm run build
```

Tests cover prediction rendering, horizon switching, the ingest-worker-refresh interaction, loading, and API errors.
