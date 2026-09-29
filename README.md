# TracePoint — Predictive Cybercrime Intelligence Platform

TracePoint combines historical complaint signals with real-time spatio-temporal indicators to rank likely future cash-out zones and intervention windows (+2h, +6h, +24h). It serves as an investigator decision-support platform, ensuring sensitive records stay off-chain while utilizing the **MST Blockchain** and **BridgeKey Wallet** for authorized alert coordination, accountability, and multi-agency response workflows.

---

## 1. Verified MST Testnet & Contract Details

| Item | Details |
| :--- | :--- |
| **Network Name** | MST Testnet |
| **RPC Endpoint** | `https://testnetrpc.mstblockchain.com` |
| **Chain ID** | `91562037` (`0x5752035`) |
| **Native Token** | `tMSTC` |
| **Block Explorer** | [https://testnet.mstscan.com](https://testnet.mstscan.com) |
| **Smart Contract** | `TracePointAlerts` |
| **Contract Address** | [`0xB5Cb7140C84108Ca6A79f843Db7ef7E1455c42a4`](https://testnet.mstscan.com/address/0xB5Cb7140C84108Ca6A79f843Db7ef7E1455c42a4) |
| **Deployment TX** | [`0x1d0b270af14e8e90299e940b959d98857bec646cd4e3415394ae666fd554e9b1`](https://testnet.mstscan.com/tx/0x1d0b270af14e8e90299e940b959d98857bec646cd4e3415394ae666fd554e9b1) (Block 5804690) |
| **Funded BridgeKey Wallet** | `0x16d31843fbb39B683e280B8FD6cB7FFd7D7785d6` (Funded with `10.0 tMSTC`) |

### Verified On-Chain Roles Granted to BridgeKey Wallet (`0x16d3...85d6`)
- `ALERT_PUBLISHER_ROLE`: [`0x7d1bcfc006d0188227599bc03d3335a3c58e804b7d1dc0eccb827a034b6b8f03`](https://testnet.mstscan.com/tx/0x7d1bcfc006d0188227599bc03d3335a3c58e804b7d1dc0eccb827a034b6b8f03)
- `ALERT_RESPONDER_ROLE`: [`0x8cc69535492e9fead7d96e9e20492ee0acff8788c9e363e810f18a3062c2f82e`](https://testnet.mstscan.com/tx/0x8cc69535492e9fead7d96e9e20492ee0acff8788c9e363e810f18a3062c2f82e)
- `ALERT_REVIEWER_ROLE`: [`0xcf80085eb19d0082a50492082e72b67bce9e58e7149380c7073f284766dae611`](https://testnet.mstscan.com/tx/0xcf80085eb19d0082a50492082e72b67bce9e58e7149380c7073f284766dae611)
- `ALERT_RESOLVER_ROLE`: [`0xb2f96d950fd5af205c0db0f00b940d1f6e3277e10776ef61389061d02fb9e5a3`](https://testnet.mstscan.com/tx/0xb2f96d950fd5af205c0db0f00b940d1f6e3277e10776ef61389061d02fb9e5a3)

---

## 2. Real MST Testnet Lifecycle Transactions

The complete investigator and responder lifecycle was verified on MST Testnet:

1. **Publish Alert:**  
   Tx: [`0xd8986a71faae93f5153fcfb7aefb34ed427105a960012b1b947484d091d8a2d5`](https://testnet.mstscan.com/tx/0xd8986a71faae93f5153fcfb7aefb34ed427105a960012b1b947484d091d8a2d5) (Block 5804749)  
   *Opaque ID, coarse jurisdiction, zone, horizon, risk band, salted snapshot commitment committed on-chain.*
2. **Responder Acknowledgement:**  
   Tx: [`0x4d5343d1d8315bd167f6b7feccceb36dcae1e923fd897432b155e44c2c8575c1`](https://testnet.mstscan.com/tx/0x4d5343d1d8315bd167f6b7feccceb36dcae1e923fd897432b155e44c2c8575c1) (Block 5804752)  
   *Transition: `PUBLISHED` -> `ACKNOWLEDGED`.*
3. **Response Commitment:**  
   Tx: [`0xdfe4bac7dba1185f5a09db7cb6b63f1d90c0fc2b365562701f8df19fccd5b2c3`](https://testnet.mstscan.com/tx/0xdfe4bac7dba1185f5a09db7cb6b63f1d90c0fc2b365562701f8df19fccd5b2c3) (Block 5804754)  
   *Transition: `ACKNOWLEDGED` -> `ACTION_COMMITTED` with 2-hour response deadline.*
4. **Resolution:**  
   Tx: [`0x780e3bb40fbec9204fb7f6f9082dff1d5e1b221390bcac51ef011b5d309fd9cd`](https://testnet.mstscan.com/tx/0x780e3bb40fbec9204fb7f6f9082dff1d5e1b221390bcac51ef011b5d309fd9cd) (Block 5804757)  
   *Transition: `ACTION_COMMITTED` -> `RESOLVED`.*

---

## 3. BridgeKey Wallet Connection & Mode Switching

### BridgeKey Connection Procedure
1. Install the official BridgeKey extension from [bridgekey.io](https://bridgekey.io) or the Chrome Web Store.
2. In the TracePoint Investigator Desk, toggle the mode button to **MST Testnet**.
3. Click **Connect BridgeKey**.
4. The dashboard requests account authorization via standard EIP-1193 (`eth_requestAccounts`).
5. If the wallet is not connected to MST Testnet (Chain ID `91562037`), the dashboard prompts an automatic network switch (`wallet_switchEthereumChain` / `wallet_addEthereumChain`).
6. Once connected, your public address (e.g. `0x16d3...85d6`) is displayed alongside the verified contract address.

### Mock vs. Testnet Mode Switching
- **Testnet Mode (`VITE_TRACEPOINT_CHAIN_MODE=testnet`):**  
  Transactions are signed via BridgeKey and broadcast to MST Testnet. Real transaction hashes and live explorer links are recorded.
- **Mock Mode (`VITE_TRACEPOINT_CHAIN_MODE=mock`):**  
  Safe offline mode for dry runs and demonstrations without network broadcast or gas fees. State transitions are simulated locally with visible DEMO tags.

---

## 4. End-to-End Demo Steps

1. **Start the FastAPI Backend:**
   ```powershell
   cd backend
   uvicorn app.main:app --port 8000
   ```
2. **Start the Frontend Dashboard:**
   ```powershell
   cd frontend
   npm run dev
   ```
3. **Simulate a Live Cybercrime Signal:**
   - In the **Synthetic Event Ingestion** panel, select a zone (e.g., `SYN-ZONE-001`), choose an event type (e.g., `TRANSACTION_SIGNAL`), and click **Ingest and refresh**.
   - Notice the live feature freshness dot turn green and the zone rank update in real time.
4. **Prepare an Alert:**
   - Select the high-risk zone and click **Publish Alert**.
   - An application-side alert draft is prepared.
5. **Sign & Broadcast via BridgeKey (Testnet Mode):**
   - Click **SIGN & BROADCAST (MST)**.
   - Approve the transaction prompt in BridgeKey.
   - The alert moves to `PUBLISHED` on MST Testnet with a clickable transaction link to MSTScan.
6. **Acknowledge and Resolve:**
   - Click **SIGN → ACKNOWLEDGED (MST)** -> Approve in BridgeKey.
   - Click **SIGN → ACTION_COMMITTED (MST)** -> Approve in BridgeKey.
   - Click **SIGN → RESOLVED (MST)** -> Approve in BridgeKey.
   - The complete lifecycle is recorded and indexed on MST Testnet.

---

## 5. Verification Commands

All test suites and production builds pass:

```powershell
# 1. Backend + ML Tests (44 tests)
python -m pytest

# 2. Frontend Unit & Integration Tests (16 tests)
npm test --prefix frontend

# 3. Hardhat Contract Tests (5 tests)
npm test --prefix blockchain

# 4. Frontend Production Build
npm run build --prefix frontend
```
