import { Clock3, ExternalLink, FileClock } from "lucide-react";
import { useState } from "react";
import type { AuditItem } from "../types";

const actionLabels: Record<AuditItem["action"], string> = {
  EVENT_INGESTED: "Synthetic event ingested",
  PREDICTION_REFRESHED: "Prediction refreshed",
  ZONE_REVIEWED: "Zone reviewed",
  ALERT_PREPARED: "Alert prepared",
  ALERT_DISMISSED: "Alert dismissed",
  ZONE_MONITORED: "Zone set to monitor",
  ALERT_STATE_CHANGED: "Alert state transition",
};

export function ActivityPanel({
  activity,
  isExpanded = false,
}: {
  activity: AuditItem[];
  isExpanded?: boolean;
}) {
  const [filterType, setFilterType] = useState<"ALL" | "CHAIN" | "INGEST" | "PREDICTION">("ALL");

  const filteredItems = activity.filter((item) => {
    if (filterType === "CHAIN") return item.action === "ALERT_STATE_CHANGED" || item.summary.includes("MST");
    if (filterType === "INGEST") return item.action === "EVENT_INGESTED";
    if (filterType === "PREDICTION") return item.action === "PREDICTION_REFRESHED" || item.action === "ZONE_REVIEWED";
    return true;
  });

  const displayItems = isExpanded ? filteredItems : filteredItems.slice(0, 8);

  const extractTxHash = (summary: string): string | null => {
    const match = summary.match(/0x[\da-fA-F]{64}/);
    return match ? match[0] : null;
  };

  return (
    <section className="activity-panel" id="activity-log" aria-labelledby="activity-title">
      <div className="section-heading activity-heading-wrap">
        <div>
          <span className="eyebrow">AUDIT &amp; PROVENANCE RECORD</span>
          <h2 id="activity-title">Activity timeline</h2>
        </div>
        <div className="activity-filter-group">
          <button
            className={`filter-chip ${filterType === "ALL" ? "chip-active" : ""}`}
            onClick={() => setFilterType("ALL")}
          >
            All
          </button>
          <button
            className={`filter-chip ${filterType === "CHAIN" ? "chip-active" : ""}`}
            onClick={() => setFilterType("CHAIN")}
          >
            Blockchain (MST)
          </button>
          <button
            className={`filter-chip ${filterType === "INGEST" ? "chip-active" : ""}`}
            onClick={() => setFilterType("INGEST")}
          >
            Ingestion
          </button>
          <button
            className={`filter-chip ${filterType === "PREDICTION" ? "chip-active" : ""}`}
            onClick={() => setFilterType("PREDICTION")}
          >
            Predictions
          </button>
        </div>
      </div>

      {displayItems.length ? (
        <ol className="activity-list">
          {displayItems.map((item) => {
            const isBlockchain = item.action === "ALERT_STATE_CHANGED" || item.summary.includes("MST");
            const txHash = extractTxHash(item.summary);

            return (
              <li key={item.id} className={`activity-row ${isBlockchain ? "activity-blockchain" : ""}`}>
                <span className={`activity-dot activity-${item.action.toLowerCase()}`} />
                <div className="activity-content">
                  <div className="activity-title-line">
                    <strong>{actionLabels[item.action] ?? item.action}</strong>
                    <span className={`origin-badge ${isBlockchain ? "badge-chain" : "badge-app"}`}>
                      {isBlockchain ? "ON-CHAIN MST" : "APPLICATION"}
                    </span>
                  </div>
                  <span className="activity-summary">{item.summary}</span>

                  {txHash && (
                    <a
                      href={`https://testnet.mstscan.com/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="activity-tx-link mono"
                    >
                      <ExternalLink size={10} /> MSTScan: {txHash.slice(0, 10)}…{txHash.slice(-6)}
                    </a>
                  )}
                </div>
                <time className="mono">
                  <Clock3 size={11} />
                  {new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="activity-empty">
          <FileClock size={20} />
          <span>No activity matching filter in this session.</span>
        </div>
      )}
    </section>
  );
}
