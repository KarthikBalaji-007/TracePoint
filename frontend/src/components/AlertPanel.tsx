import {
  AlertTriangle,
  Bell,
  Check,
  ExternalLink,
  Eye,
  Flag,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  MinusCircle,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import type { AuditItem, DemoAlert, Prediction } from "../types";

export type InvestigatorAction = "review" | "dismiss" | "monitor" | "publish";

const LIFECYCLE_STAGES = [
  { key: "DRAFT", label: "Draft" },
  { key: "PUBLISHED", label: "Published" },
  { key: "ACKNOWLEDGED", label: "Acknowledged" },
  { key: "ACTION_COMMITTED", label: "Action Committed" },
  { key: "RESOLVED", label: "Resolved" },
] as const;

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
  const [activeStepTab, setActiveStepTab] = useState<1 | 2 | 3 | 4>(1);
  const activeAlert = alerts[0];

  const getStepProgress = (state?: DemoAlert["state"]): number => {
    switch (state) {
      case "DRAFT": return 1;
      case "PUBLISHED": return 2;
      case "ACKNOWLEDGED": return 3;
      case "ACTION_COMMITTED": return 4;
      case "RESOLVED": return 5;
      case "DISPUTED": return 3;
      case "EXPIRED": return 2;
      default: return 0;
    }
  };

  const progressIndex = getStepProgress(activeAlert?.state);

  return (
    <section className="alert-panel" id="alert-workflow" aria-labelledby="alert-title">
      {/* Header and Network Mode Switcher */}
      <div className="section-heading alert-heading-wrap">
        <div>
          <span className="eyebrow">
            {isTestnet ? "MST BLOCKCHAIN ANCHOR" : "INVESTIGATOR DECISION & LIFECYCLE"}
          </span>
          <h2 id="alert-title">Alert workflow</h2>
        </div>
        <div className="alert-header-actions">
          {onToggleChainMode && (
            <button
              className="mode-toggle-btn"
              onClick={() => onToggleChainMode(isTestnet ? "mock" : "testnet")}
              title="Toggle between Live MST Testnet and Mock Mode"
            >
              Mode: {isTestnet ? "MST Testnet" : "Mock"}
            </button>
          )}
          <Bell size={17} />
        </div>
      </div>

      {/* Network / BridgeKey Status Bar */}
      <div className={`blockchain-status-bar ${isTestnet ? "bar-testnet" : "bar-mock"}`}>
        <div className="status-bar-row">
          <span className="network-pill">
            <ShieldCheck size={14} />
            <strong>{isTestnet ? "MST Testnet (91562037)" : "Local Mock Workflow"}</strong>
          </span>
          {isTestnet && (
            walletAddress ? (
              <span className="wallet-pill mono" title={`Connected BridgeKey: ${walletAddress}`}>
                <Wallet size={12} /> {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
            ) : (
              <button
                className="button-connect-wallet"
                onClick={onConnectWallet}
                disabled={isConnectingWallet}
              >
                <Wallet size={12} />
                {isConnectingWallet ? "Connecting…" : "Connect BridgeKey"}
              </button>
            )
          )}
        </div>
        {isTestnet && contractAddress && (
          <div className="contract-link-row">
            <LinkIcon size={11} />
            <span>Contract:</span>
            <a
              href={`https://testnet.mstscan.com/address/${contractAddress}`}
              target="_blank"
              rel="noreferrer"
              className="mono link-explorer"
            >
              {contractAddress.slice(0, 8)}…{contractAddress.slice(-6)}
            </a>
          </div>
        )}
      </div>

      {/* Structured 4-Step Workflow Visualizer */}
      <div className="alert-stepper-container">
        <div className="stepper-nav" role="tablist">
          <button
            className={`step-tab ${activeStepTab === 1 ? "step-tab-active" : ""}`}
            onClick={() => setActiveStepTab(1)}
          >
            <span className="step-num">1</span>
            <span>Review Evidence</span>
          </button>
          <button
            className={`step-tab ${activeStepTab === 2 ? "step-tab-active" : ""}`}
            onClick={() => setActiveStepTab(2)}
          >
            <span className="step-num">2</span>
            <span>Sign Hash</span>
          </button>
          <button
            className={`step-tab ${activeStepTab === 3 ? "step-tab-active" : ""}`}
            onClick={() => setActiveStepTab(3)}
          >
            <span className="step-num">3</span>
            <span>Broadcast MST</span>
          </button>
          <button
            className={`step-tab ${activeStepTab === 4 ? "step-tab-active" : ""}`}
            onClick={() => setActiveStepTab(4)}
          >
            <span className="step-num">4</span>
            <span>Track Explorer</span>
          </button>
        </div>

        {/* Step Tab Content */}
        <div className="step-detail-card">
          {activeStepTab === 1 && (
            <div className="step-tab-body">
              <h4>Step 1: Evidence Validation</h4>
              <p>Verify risk scores, historical priors, and live cluster indicators before signing.</p>
              <div className="evidence-summary-tags">
                <span>Target: <strong>{prediction?.zone_id ?? activeAlert?.zoneId ?? "Select Zone"}</strong></span>
                <span>Horizon: <strong>{prediction?.horizon ?? activeAlert?.horizon ?? "+2h"}</strong></span>
                <span>Risk Band: <strong>{prediction?.risk_band ?? activeAlert?.riskBand ?? "HIGH"}</strong></span>
                <span>Provenance: <strong>SYNTHETIC DEMO</strong></span>
              </div>
            </div>
          )}

          {activeStepTab === 2 && (
            <div className="step-tab-body">
              <h4>Step 2: Cryptographic Hash Signature</h4>
              <p className="highlight-notice">
                <KeyRound size={14} /> <strong>BridgeKey signature required.</strong> The alert payload is hashed with a random salt (`snapshotCommitment`). Private keys never leave your wallet.
              </p>
            </div>
          )}

          {activeStepTab === 3 && (
            <div className="step-tab-body">
              <h4>Step 3: On-Chain MST Testnet Broadcast</h4>
              <p>Anchoring `publishAlert(alertId, commitments)` on MST Testnet smart contract.</p>
              <div className="chain-info-row mono">
                <span>Chain ID: 91562037</span>
                <span>Token: tMSTC</span>
                <span>Gas: Sub-second block time</span>
              </div>
            </div>
          )}

          {activeStepTab === 4 && (
            <div className="step-tab-body">
              <h4>Step 4: Real-Time On-Chain Verification</h4>
              <p>Direct proof of publication and multi-party state machine progression on MSTScan.</p>
              {activeAlert?.txHash ? (
                <a
                  href={`https://testnet.mstscan.com/tx/${activeAlert.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mstscan-button-link"
                >
                  <ExternalLink size={13} /> View on MSTScan: {activeAlert.txHash.slice(0, 14)}…
                </a>
              ) : (
                <span className="text-muted">Awaiting alert broadcast to display transaction hash.</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lifecycle Progress Bar */}
      <div className="lifecycle-track">
        <span className="lifecycle-label">CONTRACT LIFECYCLE:</span>
        <div className="lifecycle-steps">
          {LIFECYCLE_STAGES.map((stage, idx) => {
            const isCompleted = progressIndex > idx + 1;
            const isCurrent = progressIndex === idx + 1;
            return (
              <div
                key={stage.key}
                className={`stage-node ${isCurrent ? "stage-current" : isCompleted ? "stage-done" : ""}`}
              >
                <span className="stage-dot">
                  {isCompleted ? <Check size={10} /> : idx + 1}
                </span>
                <span className="stage-name">{stage.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons for Decision Support */}
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

      {/* Clear boundary and disclaimer labels */}
      <div className="alert-disclaimer">
        Publish Alert prepares an application-side DRAFT only. No MST transaction is submitted until signed.
      </div>
      <div className="alert-disclaimer">
        Local mock transitions exercise the workflow only. They create no wallet signatures, transaction hashes, or chain records.
      </div>

      {/* Alert List and Live Transitions */}
      <div className="alert-list">
        {alerts.length ? (
          alerts.slice(0, 4).map((alert) => {
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
                <div className="draft-info">
                  <div className="draft-top">
                    <strong>{alert.zoneId} · {alert.horizon}</strong>
                    <span className="draft-state">{alert.state}</span>
                  </div>
                  <small className="mono">
                    {alert.riskBand ?? "Unbanded"} · {alert.alertId.slice(0, 16)}…
                  </small>

                  {/* Transaction Link */}
                  {alert.txHash && (
                    <div className="tx-link-row">
                      <a
                        href={`https://testnet.mstscan.com/tx/${alert.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="tx-explorer-link mono"
                      >
                        <ExternalLink size={11} />
                        MST TX: {alert.txHash.slice(0, 10)}…{alert.txHash.slice(-6)}
                      </a>
                    </div>
                  )}

                  {isPendingThisAlert && (
                    <div className="tx-pending-notice mono">
                      <Loader2 size={12} className="spin" /> Transaction pending signature/confirmation…
                    </div>
                  )}

                  {alert.txError && (
                    <div className="tx-error-notice">
                      <AlertTriangle size={12} /> {alert.txError}
                    </div>
                  )}

                  {/* Real MST Testnet Actions */}
                  {isTestnet && walletAddress && (
                    <div className="testnet-actions">
                      {alert.state === "DRAFT" && onTestnetPublish && (
                        <button
                          className="btn-chain-action btn-publish-chain"
                          disabled={isPendingThisAlert}
                          onClick={() => onTestnetPublish(alert)}
                        >
                          SIGN &amp; BROADCAST (MST)
                        </button>
                      )}
                      {alert.state !== "DRAFT" && next && onTestnetTransition && (
                        <button
                          className="btn-chain-action btn-transition-chain"
                          disabled={isPendingThisAlert}
                          onClick={() => onTestnetTransition(alert, next)}
                        >
                          SIGN → {next} (MST)
                        </button>
                      )}
                      {canDispute && onTestnetTransition && (
                        <button
                          className="btn-chain-action btn-dispute-chain"
                          disabled={isPendingThisAlert}
                          onClick={() => onTestnetTransition(alert, "DISPUTED")}
                        >
                          DISPUTE (MST)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Mock Workflow Actions */}
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
              </div>
            );
          })
        ) : (
          <div className="alert-empty">No alert requests prepared in this session. Click "Publish Alert" to create a draft.</div>
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
