# TracePoint Alert Lifecycle

This workspace prepares the minimum alert contract and adapter boundary. Contract data is limited to opaque alert/zone/jurisdiction references, horizon, risk band, model/fusion version digests, a salted prediction-snapshot commitment, expiry/deadline and wallet addresses emitted by transitions. PII, account identifiers, transaction details, exact coordinates, notes, full scores and feature payloads are excluded.

## Local contract workflow

Requires Node.js 18+. From `blockchain/`:

```powershell
npm install
npm test
npm run deploy:local
```

Run the dashboard and session-local mock lifecycle tests from `frontend/` with `npm test`.

Hardhat local mode uses its ephemeral chain and funded test accounts; it needs no MST credentials. `deploy:local` prints the address actually returned by the local node. It does not write fake addresses into configuration.

## MST testnet configuration

`MST_NETWORK_MODE` defaults to `mock`. Testnet commands require `MST_NETWORK_MODE=testnet`, `MST_RPC_URL`, and a verified `MST_CHAIN_ID`; the frontend additionally requires `VITE_MST_ALERTS_CONTRACT_ADDRESS`. Chain ID and deployment address are intentionally blank in `.env.example`; do not copy an unverified value. No private key, password or seed phrase is supported by this project. Real deployment/signing awaits the organization-approved BridgeKey flow and funded testnet actor wallet.

The MST SDK repository documents `https://testnetrpc.mstblockchain.com` as its testnet RPC, and the MST developer site describes the testnet as EVM compatible. The public sources reviewed did not establish a chain ID suitable for pinning here. BridgeKey's public material confirms MST/EVM support but does not document an application-provider API. TracePoint therefore uses a standard EIP-1193 provider boundary supplied by the wallet integrator; it never guesses an injected global or asks for key material. Verify compatibility with the installed BridgeKey extension before enabling live mode.

## Lifecycle

The contract enforces role-gated `PUBLISHED -> ACKNOWLEDGED -> ACTION_COMMITTED -> RESOLVED`; `PUBLISHED` and `ACKNOWLEDGED` can be disputed; `PUBLISHED`, `ACTION_COMMITTED`, and `DISPUTED` may expire under the configured deadline. `DISPUTED` can resolve or expire. The dashboard keeps its application `DRAFT` separate and offers an explicitly marked session-local mock lifecycle. Mock transitions create no RPC call, wallet signature, transaction hash or persistent chain record.

Contract and mock adapter tests cover roles, transitions, expiry, and privacy-boundary metadata. This code is an MVP foundation and still needs an independent security review before any public or consortium deployment.
