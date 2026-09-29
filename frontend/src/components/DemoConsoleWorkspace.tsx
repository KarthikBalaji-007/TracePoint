import { CheckCircle2, ChevronRight, Database, LoaderCircle, Play, RadioTower, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { EventType, Zone } from "../types";

const amounts = ["BAND_1", "BAND_2", "BAND_3", "BAND_4"];
const channels = ["UPI", "AEPS", "CARD", "NET_BANKING"];
const categories = ["PHISHING", "QR_FRAUD", "IMPERSONATION", "INVESTMENT_SCAM"];

export function DemoConsoleWorkspace({
  zones,
  busy,
  result,
  onIngestSyntheticEvent,
  onRunWorker,
  onRefreshPredictions,
}: {
  zones: Zone[];
  busy: boolean;
  result: string | null;
  onIngestSyntheticEvent: (event: { zone: Zone; eventType: EventType; amountBand: string; channel: string; category: string }) => Promise<void>;
  onRunWorker: () => Promise<void>;
  onRefreshPredictions: () => Promise<void>;
}) {
  const [zoneId, setZoneId] = useState(zones[0]?.zone_id ?? "");
  const [eventType, setEventType] = useState<EventType>("TRANSACTION_SIGNAL");
  const [amountBand, setAmountBand] = useState("BAND_4");
  const [channel, setChannel] = useState("UPI");
  const [category, setCategory] = useState("QR_FRAUD");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  const zone = zones.find((z) => z.zone_id === zoneId) ?? zones[0];

  const handleSimulate = async (e: FormEvent) => {
    e.preventDefault();
    if (!zone) return;
    setCurrentStep(1);
    await onIngestSyntheticEvent({ zone, eventType, amountBand, channel, category });
    setCurrentStep(3); // after ingest + worker in parent handler
  };

  const loadPreset = (presetZoneId: string, band: string, cat: string) => {
    const target = zones.find((z) => z.zone_id === presetZoneId);
    if (target) {
      setZoneId(target.zone_id);
      setAmountBand(band);
      setCategory(cat);
      setEventType("TRANSACTION_SIGNAL");
    }
  };

  return (
    <div className="demo-console-workspace">
      {/* Console Header */}
      <div className="demo-console-header">
        <div>
          <span className="eyebrow eyebrow-alert">CONTROLLED EVALUATION ENVIRONMENT</span>
          <h2>Interactive Demo Console</h2>
          <p className="demo-console-subtitle">
            Inject synthetic fraudulent transaction signals, trigger the event processing worker, observe real-time risk rank shifts, and advance alerts through the MST blockchain lifecycle.
          </p>
        </div>
        <div className="demo-console-badge">
          <ShieldCheck size={16} />
          <span>SYNTHETIC DEMO PIPELINE</span>
        </div>
      </div>

      {/* 4-Step Interactive Pipeline Progress */}
      <div className="demo-pipeline-flow">
        <div className={`pipeline-step ${currentStep >= 1 ? "step-active" : ""}`}>
          <div className="step-number">1</div>
          <div className="step-content">
            <strong>Signal Injection</strong>
            <small>POST /api/v1/events</small>
          </div>
        </div>
        <ChevronRight size={16} className="pipeline-arrow" />
        <div className={`pipeline-step ${currentStep >= 2 ? "step-active" : ""}`}>
          <div className="step-number">2</div>
          <div className="step-content">
            <strong>Worker Processing</strong>
            <small>Durable queue &amp; replay</small>
          </div>
        </div>
        <ChevronRight size={16} className="pipeline-arrow" />
        <div className={`pipeline-step ${currentStep >= 3 ? "step-active" : ""}`}>
          <div className="step-number">3</div>
          <div className="step-content">
            <strong>Risk Rescoring</strong>
            <small>H + L Spatio-temporal decay</small>
          </div>
        </div>
        <ChevronRight size={16} className="pipeline-arrow" />
        <div className={`pipeline-step ${currentStep >= 4 ? "step-active" : ""}`}>
          <div className="step-number">4</div>
          <div className="step-content">
            <strong>MST Testnet Anchor</strong>
            <small>TracePointAlerts.sol</small>
          </div>
        </div>
      </div>

      {/* Main Grid: Generator Controls & Live Feedback */}
      <div className="demo-console-grid">
        {/* Signal Configurator */}
        <div className="demo-card">
          <div className="card-header">
            <span className="eyebrow">STEP 1: CONFIGURE SIGNAL</span>
            <h3>Synthetic Incident Generator</h3>
          </div>

          {/* Quick Presets */}
          <div className="preset-row">
            <span className="preset-label">Quick Presets:</span>
            {zones.slice(0, 3).map((z) => (
              <button
                key={z.zone_id}
                type="button"
                className="button-chip"
                onClick={() => loadPreset(z.zone_id, "BAND_4", "QR_FRAUD")}
              >
                <Zap size={11} /> {z.label} (High Spike)
              </button>
            ))}
          </div>

          <form className="demo-form" onSubmit={handleSimulate}>
            <div className="form-group">
              <label>Target Zone</label>
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
                {zones.map((item) => (
                  <option key={item.zone_id} value={item.zone_id}>
                    {item.label} ({item.zone_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Signal Type</label>
                <select value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
                  <option value="TRANSACTION_SIGNAL">Transaction Signal</option>
                  <option value="COMPLAINT">Complaint</option>
                </select>
              </div>

              <div className="form-group">
                <label>Amount Band</label>
                <select value={amountBand} onChange={(e) => setAmountBand(e.target.value)}>
                  {amounts.map((band) => (
                    <option key={band} value={band}>{band}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Payment Channel</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {channels.map((ch) => (
                    <option key={ch} value={ch}>{ch}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Scam Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={busy || !zone}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}
                {busy ? "Executing Pipeline…" : "Ingest and refresh"}
              </button>
            </div>
          </form>
        </div>

        {/* Live Execution Feedback & Worker Manual Control */}
        <div className="demo-card">
          <div className="card-header">
            <span className="eyebrow">STEP 2 &amp; 3: PIPELINE STATUS</span>
            <h3>Backend Worker &amp; Ingestion Feedback</h3>
          </div>

          <div className="status-terminal">
            <div className="terminal-header">
              <span className="terminal-dot" />
              <span className="terminal-title mono">EVENT WORKER LOG</span>
            </div>
            <div className="terminal-body mono">
              {busy ? (
                <div className="terminal-line text-accent">
                  <LoaderCircle size={12} className="spin" /> Processing queued events through SQLite worker…
                </div>
              ) : result ? (
                <div className="terminal-line text-success">
                  <CheckCircle2 size={12} /> {result}
                </div>
              ) : (
                <div className="terminal-line text-muted">
                  Awaiting simulated event dispatch. System in continuous listening state.
                </div>
              )}
            </div>
          </div>

          {/* Manual Backend Controls */}
          <div className="manual-controls">
            <span className="manual-label">Manual Pipeline Triggers:</span>
            <div className="manual-buttons">
              <button className="button button-secondary" onClick={() => void onRunWorker()} disabled={busy}>
                <Database size={14} /> Run Event Worker
              </button>
              <button className="button button-secondary" onClick={() => void onRefreshPredictions()} disabled={busy}>
                <RefreshCw size={14} /> Rescore Predictions
              </button>
            </div>
          </div>

          <div className="demo-provenance-box">
            <RadioTower size={14} />
            <span>
              Synthetic provenance tag is attached to every simulated event payload. No external police feeds or bank systems are modified.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
