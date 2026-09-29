# TracePoint — Implementation Plan & Status

**Project:** TracePoint — Predictive Cybercrime Intelligence & Cash-Out Risk Platform  
**Target:** Real MST Testnet + BridgeKey Non-Custodial Integration  
**Status:** Completed & Deployed  
**Canonical Root:** `C:\Karthik\Engg\Projects\MST\TracePoint\`

---

## 1. System Architecture & Off-Chain / On-Chain Boundary

```text
[Sources: Ingestion API]
         ↓
[Operational Store: SQLite] ──> [Feature Store & Spatio-temporal Stream]
                                              ↓
[Historical Models (H)]  +  [Live Risk Signals (L)]  ──> [Risk Fusion (F)]
                                                              ↓
                                                     [Zone Forecasts & Evidence UI]
                                                              ↓
                                                    [Investigator Review & Draft]
                                                              ↓
                                                     [BridgeKey EIP-1193 Signing]
                                                              ↓
                                                 [TracePointAlerts on MST Testnet]
                                                  (Opaque metadata only:
                                                   alertId, zoneId, jurisdiction,
                                                   salted snapshot commitment)
                                                              ↓
                                                    [Responder Lifecycle]
                                            (ACKNOWLEDGE -> ACTION_COMMIT -> RESOLVE)
                                                              ↓
                                              [Off-Chain RPC Event Indexer]
```

---

## 2. On-Chain Data Privacy Rules

TracePoint enforces strict zero-leakage principles on MST Testnet:
- **Stored on-chain:** Opaque Keccak-256 Alert ID, coarse jurisdiction ID, coarse zone ID, horizon code, risk band code, model version hash, fusion ruleset hash, salted snapshot commitment, opaque off-chain reference, expiry timestamp, response deadline timestamp.
- **Never on-chain:** Names, phone numbers, victim details, bank account numbers, UPI IDs, exact ATM/GPS coordinates, raw transactions, investigation notes.

---

## 3. MST Testnet Contract & Deployment

- **Contract:** `TracePointAlerts.sol` (Solidity `0.8.24`, Cancun EVM, OpenZeppelin-compatible role model)
- **Address:** `0xB5Cb7140C84108Ca6A79f843Db7ef7E1455c42a4`
- **Network:** MST Testnet (Chain ID `91562037`, RPC `https://testnetrpc.mstblockchain.com`)
- **Explorer:** `https://testnet.mstscan.com/address/0xB5Cb7140C84108Ca6A79f843Db7ef7E1455c42a4`
- **Deployer:** `0x2614b2A47eCAaF035E71245f0c3c0Ed5a2946efD`
- **Authorized BridgeKey Wallet:** `0x16d31843fbb39B683e280B8FD6cB7FFd7D7785d6` (all 4 roles granted)

---

## 4. BridgeKey Integration

- Standard EIP-1193 detection via `window.ethereum` or `window.bridgekey`.
- Automatic chain validation (`Chain ID: 91562037`).
- EIP-3326 / EIP-3085 automated chain switching (`wallet_switchEthereumChain` / `wallet_addEthereumChain`).
- Non-custodial: No private keys, seed phrases, or credentials are ever handled by TracePoint.
