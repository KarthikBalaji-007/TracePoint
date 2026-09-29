import { Bell, Check, ExternalLink, Eye, Flag, Link as LinkIcon, MinusCircle, Send, ShieldCheck, Wallet } from "lucide-react";
import type { AuditItem, DemoAlert, Prediction } from "../types";

export type InvestigatorAction = "review" | "dismiss" | "monitor" | "publish";

export function AlertPanel({
  prediction,
  alerts,
  onAction,
  onMockAdvance,
  onMockDispute,
  onMockExpire,
  chainMode = "mock",
  onToggleChainMode,
  walletAddress,
  onConnectWallet,
  isConnectingWallet,
  contractAddress,
  onTestnetPublish,
  onTestnetTransition,
  txPendingAlertId,
}: {
  prediction?: Prediction;
  alerts: DemoAlert[];
  onAction: (action: InvestigatorAction, prediction: Prediction) => void;
  onMockAdvance: (alert: DemoAlert) => void;
  onMockDispute: (alert: DemoAlert) => void;
  onMockExpire: (alert: DemoAlert) => void;
  chainMode?: "mock" | "testnet";
  onToggleChainMode?: (mode: "mock" | "testnet") => void;
  walletAddress?: string | null;
  onConnectWallet?: () => void;
  isConnectingWallet?: boolean;
  contractAddress?: string;
  onTestnetPublish?: (alert: DemoAlert) => void;
  onTestnetTransition?: (alert: DemoAlert, targetState: string) => void;
  txPendingAlertId?: string | null;
}) {
  const isTestnet = chainMode === "testnet";

  return (
    <section className="alert-panel" id="alert-workflow" aria-labelledby="alert-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{isTestnet ? "MST TESTNET WORKFLOW" : "OFF-CHAIN DEMO WORKFLOW"}</span>
          <h2 id="alert-title">Investigator actions</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {onToggleChainMode && (
            <button
              className="mode-toggle-btn"
              onClick={() => onToggleChainMode(isTestnet ? "mock" : "testnet")}
              title="Toggle between MST Testnet and Mock Mode"
              style={{
                fontSize: "11px",
                padding: "3px 8px",
                borderRadius: "4px",
                border: "1px solid var(--border-color, #444)",
                background: isTestnet ? "#0f3a2a" : "#2a2a2a",
                color: isTestnet ? "#4ade80" : "#aaa",
                cursor: "pointer",
              }}
            >
              Mode: {isTestnet ? "MST Testnet" : "Mock"}
            </button>
          )}
          <Bell size={17} />
        </div>
      </div>

      {isTestnet && (
        <div
          className="blockchain-status-bar"
          style={{
            background: "#121a16",
            border: "1px solid #1e3a2b",
            borderRadius: "6px",
            padding: "8px 10px",
            marginBottom: "12px",
            fontSize: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#4ade80" }}>
              <ShieldCheck size={14} />
              <strong>MST Testnet (91562037)</strong>
            </span>
            {walletAddress ? (
              <span
                style={{
                  fontFamily: "monospace",
                  background: "#1a2c22",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  color: "#86efac",
                }}
              >
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
            ) : (
              <button
                onClick={onConnectWallet}
                disabled={isConnectingWallet}
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  background: "#166534",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Wallet size={12} />
                {isConnectingWallet ? "Connecting…" : "Connect BridgeKey"}
              </button>
            )}
          </div>
          {contractAddress && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#9ca3af", fontSize: "11px" }}>
              <LinkIcon size={11} />
              <span>Contract:</span>
              <a
                href={`https://testnet.mstscan.com/address/${contractAddress}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#60a5fa", textDecoration: "none" }}
              >
                {contractAddress.slice(0, 8)}…{contractAddress.slice(-6)}
              </a>
            </div>
          )}
        </div>
      )}

      <div className="action-buttons">
        <button disabled={!prediction} onClick={() => prediction && onAction("review", prediction)}>
          <Eye size={15} />
          Review
        </button>
        <button disabled={!prediction} onClick={() => prediction && onAction("dismiss", prediction)}>
          <MinusCircle size={15} />
          Dismiss
        </button>
        <button disabled={!prediction} onClick={() => prediction && onAction("monitor", prediction)}>
          <Flag size={15} />
          Monitor
        </button>
        <button
          className="publish-button"
          disabled={!prediction || prediction.fused_score_f === null}
          onClick={() => prediction && onAction("publish", prediction)}
        >
          <Send size={15} />
          Publish Alert
        </button>
      </div>

      <div className="alert-disclaimer">
        Publish Alert prepares an application-side DRAFT only. No MST transaction is submitted.
      </div>
      <div className="alert-disclaimer">
        Local mock transitions exercise the workflow only. They create no wallet signatures, transaction hashes, or chain records.
      </div>

      <div className="alert-list">
        {alerts.length ? (
          alerts.slice(0, 3).map((alert) => {
            const nextByState: Partial<Record<DemoAlert["state"], string>> = {
              DRAFT: "PUBLISHED",
              PUBLISHED: "ACKNOWLEDGED",
              ACKNOWLEDGED: "ACTION_COMMITTED",
              ACTION_COMMITTED: "RESOLVED",
              DISPUTED: "RESOLVED",
            };
            const next = nextByState[alert.state];
            const canDispute = alert.state === "PUBLISHED" || alert.state === "ACKNOWLEDGED";
            const canExpire =
              alert.state === "PUBLISHED" || alert.state === "ACTION_COMMITTED" || alert.state === "DISPUTED";
            const isPendingThisAlert = txPendingAlertId === alert.alertId;

            return (
              <div className="alert-draft" key={alert.alertId}>
                <span className="draft-icon">
                  <Check size={14} />
                </span>
                <div>
                  <strong>
                    {alert.zoneId} · {alert.horizon}
                  </strong>
                  <small>
                    {alert.riskBand ?? "Unbanded"} · {alert.state} · {alert.alertId}
                  </small>

                  {alert.txHash && (
                    <div style={{ marginTop: "4px" }}>
                      <a
                        href={`https://testnet.mstscan.com/tx/${alert.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: "11px",
                          color: "#60a5fa",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          textDecoration: "none",
                        }}
                      >
                        <ExternalLink size={10} />
                        MST TX: {alert.txHash.slice(0, 10)}…{alert.txHash.slice(-6)}
                      </a>
                    </div>
                  )}

                  {isPendingThisAlert && (
                    <div style={{ color: "#facc15", fontSize: "11px", marginTop: "3px" }}>
                      Transaction pending signature/confirmation…
                    </div>
                  )}

                  {alert.txError && (
                    <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "3px" }}>
                      Error: {alert.txError}
                    </div>
                  )}

                  {/* Testnet execution actions when in testnet mode and wallet connected */}
                  {isTestnet && walletAddress && (
                    <div className="testnet-actions" style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                      {alert.state === "DRAFT" && onTestnetPublish && (
                        <button
                          disabled={isPendingThisAlert}
                          onClick={() => onTestnetPublish(alert)}
                          style={{ fontSize: "11px", padding: "3px 8px", background: "#15803d", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer" }}
                        >
                          SIGN &amp; BROADCAST (MST)
                        </button>
                      )}
                      {alert.state !== "DRAFT" && next && onTestnetTransition && (
                        <button
                          disabled={isPendingThisAlert}
                          onClick={() => onTestnetTransition(alert, next)}
                          style={{ fontSize: "11px", padding: "3px 8px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer" }}
                        >
                          SIGN → {next} (MST)
                        </button>
                      )}
                      {canDispute && onTestnetTransition && (
                        <button
                          disabled={isPendingThisAlert}
                          onClick={() => onTestnetTransition(alert, "DISPUTED")}
                          style={{ fontSize: "11px", padding: "3px 8px", background: "#b91c1c", color: "#fff", border: "none", borderRadius: "3px", cursor: "pointer" }}
                        >
                          DISPUTE (MST)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Mock workflow actions */}
                  {!next && !canDispute && !canExpire ? (
                    <small className="mock-label">MOCK LIFECYCLE COMPLETE</small>
                  ) : (
                    <div className="mock-actions">
                      {next && (
                        <button
                          onClick={() => onMockAdvance(alert)}
                          aria-label={`Advance mock lifecycle to ${next}`}
                        >
                          MOCK → {next}
                        </button>
                      )}
                      {canDispute && <button onClick={() => onMockDispute(alert)}>MOCK DISPUTE</button>}
                      {canExpire && <button onClick={() => onMockExpire(alert)}>MOCK EXPIRE</button>}
                    </div>
                  )}
                </div>
                <span className="draft-state">{alert.state}</span>
              </div>
            );
          })
        ) : (
          <div className="alert-empty">No alert requests prepared in this session.</div>
        )}
      </div>
    </section>
  );
}

export function auditActionFor(action: InvestigatorAction): AuditItem["action"] {
  if (action === "review") return "ZONE_REVIEWED";
  if (action === "dismiss") return "ALERT_DISMISSED";
  if (action === "monitor") return "ZONE_MONITORED";
  return "ALERT_PREPARED";
}
