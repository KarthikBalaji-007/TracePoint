import { AlertCircle, Database, LoaderCircle, RefreshCw, ShieldCheck, Siren, TrendingUp, Waypoints } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { bootstrapSyntheticDemo, getAllZones, getLiveFeatures, getPredictions, getZones, ingestSyntheticEvent, processWorker } from "./api";
import { ActivityPanel } from "./components/ActivityPanel";
import { AlertPanel, auditActionFor, type InvestigatorAction } from "./components/AlertPanel";
import { DashboardShell } from "./components/DashboardShell";
import { EventSimulator } from "./components/EventSimulator";
import { FreshnessIndicator } from "./components/FreshnessIndicator";
import { RankingTable } from "./components/RankingTable";
import { RiskCard } from "./components/RiskCard";
import { ZoneEvidencePanel } from "./components/ZoneEvidencePanel";
import { ZoneMap } from "./components/ZoneMap";
import { prepareAlertDraft } from "./services/alertWorkflow";
import { MockAlertWorkflowAdapter } from "./services/blockchain/mockAdapter";
import { HORIZONS, type AuditItem, type DemoAlert, type Horizon, type LiveFeature, type MapLayer, type Prediction, type Zone } from "./types";

type LoadState = "loading" | "current" | "empty" | "stale" | "unavailable";

function freshLocalDateTime(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function isoFromLocal(value: string): string {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function audit(action: AuditItem["action"], summary: string, zoneId?: string): AuditItem {
  return { id: crypto.randomUUID(), action, summary, zoneId, at: new Date().toISOString() };
}

function freshnessFrom(features: LiveFeature[]): string {
  if (features.some((feature) => feature.has_recent_data)) return "CURRENT";
  if (features.some((feature) => feature.last_event_at)) return "STALE";
  return "NO_DATA";
}

export default function App() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [zoneScope, setZoneScope] = useState<string[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [liveFeatures, setLiveFeatures] = useState<LiveFeature[]>([]);
  const [activeHorizon, setActiveHorizon] = useState<Horizon>("+2h");
  const [horizonScope, setHorizonScope] = useState<Horizon[]>([...HORIZONS]);
  const [mapLayer, setMapLayer] = useState<MapLayer>("fused");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [asOfInput, setAsOfInput] = useState(freshLocalDateTime);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loading, setLoading] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [simulatorMessage, setSimulatorMessage] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [activity, setActivity] = useState<AuditItem[]>([]);
  const [alerts, setAlerts] = useState<DemoAlert[]>([]);
  const mockAlertWorkflow = useMemo(() => new MockAlertWorkflowAdapter(), []);

  const addActivity = useCallback((item: AuditItem) => setActivity((current) => [item, ...current].slice(0, 20)), []);

  const refreshDashboard = useCallback(async (options?: { jurisdiction?: string; selectedZones?: string[]; selectedHorizons?: Horizon[]; cutoff?: string }) => {
    const jurisdiction = options?.jurisdiction ?? jurisdictionId;
    if (!jurisdiction) return;
    const cutoff = options?.cutoff ?? isoFromLocal(asOfInput);
    setLoading(true);
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const selectedZones = options?.selectedZones ?? zoneScope;
      const [predictionResponse, featureResponse] = await Promise.all([
        getPredictions({
          jurisdiction_id: jurisdiction,
          ...(selectedZones.length ? { zone_ids: selectedZones } : {}),
          horizons: options?.selectedHorizons ?? horizonScope,
          as_of: cutoff,
        }),
        getLiveFeatures(cutoff),
      ]);
      setPredictions(predictionResponse.predictions);
      setLiveFeatures(featureResponse.zones);
      setSnapshotId(predictionResponse.snapshot_id);
      setLastRefresh(new Date().toISOString());
      setLoadState(predictionResponse.predictions.length ? "current" : "empty");
      const inScope = predictionResponse.predictions.map((row) => row.zone_id);
      setSelectedZoneId((current) => current && inScope.includes(current)
        ? current
        : predictionResponse.predictions.find((row) => row.rank === 1)?.zone_id ?? inScope[0] ?? null);
      addActivity(audit("PREDICTION_REFRESHED", `${predictionResponse.predictions.length} zone-horizon rows · ${jurisdiction}`));
      return predictionResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Prediction service could not be reached.";
      setErrorMessage(message);
      setLoadState(predictions.length ? "stale" : "unavailable");
      return null;
    } finally {
      setLoading(false);
    }
  }, [addActivity, asOfInput, horizonScope, jurisdictionId, predictions.length, zoneScope]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const catalogue = await getAllZones();
        if (cancelled) return;
        const ids = [...new Set(catalogue.zones.map((zone) => zone.jurisdiction_id))].sort();
        setJurisdictions(ids);
        const initial = ids[0] ?? "";
        setJurisdictionId(initial);
        const localZones = await getZones(initial);
        if (cancelled) return;
        setZones(localZones.zones);
        if (localZones.synthetic_only) {
          const baseline = await bootstrapSyntheticDemo(initial);
          if (cancelled) return;
          if (baseline.seeded && baseline.event_id && baseline.zone_id) {
            addActivity(audit("EVENT_INGESTED", `Synthetic demo baseline · ${baseline.event_id}`, baseline.zone_id));
          }
        }
        await refreshDashboard({ jurisdiction: initial, selectedZones: [] });
      } catch (error) {
        if (cancelled) return;
        setLoadState("unavailable");
        setErrorMessage(error instanceof Error ? error.message : "Zone catalogue is unavailable.");
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const changeJurisdiction = async (nextJurisdiction: string) => {
    setJurisdictionId(nextJurisdiction);
    setZoneScope([]);
    setSelectedZoneId(null);
    try {
      const result = await getZones(nextJurisdiction);
      setZones(result.zones);
      await refreshDashboard({ jurisdiction: nextJurisdiction, selectedZones: [] });
    } catch (error) {
      setLoadState("unavailable");
      setErrorMessage(error instanceof Error ? error.message : "Jurisdiction data is unavailable.");
    }
  };

  const selectedPrediction = predictions.find((item) => item.zone_id === selectedZoneId && item.horizon === activeHorizon);
  const selectedZone = zones.find((zone) => zone.zone_id === selectedZoneId);
  const selectedLiveFeature = liveFeatures.find((feature) => feature.zone_id === selectedZoneId);
  const liveFreshness = loadState === "stale" ? "STALE" : freshnessFrom(liveFeatures);
  const topByHorizon = useMemo(() => Object.fromEntries(HORIZONS.map((horizon) => [
    horizon,
    predictions.find((row) => row.horizon === horizon && row.rank === 1),
  ])) as Partial<Record<Horizon, Prediction>>, [predictions]);
  const demoMode = zones.length > 0 && zones.every((zone) => zone.source_class === "SYNTHETIC");
  const evaluatedZoneCount = new Set(predictions.map((row) => row.zone_id)).size;

  const handleSyntheticEvent = async (input: Parameters<typeof ingestSyntheticEvent>[0]) => {
    setEventBusy(true);
    setSimulatorMessage("Sending synthetic event to the local ingestion API…");
    setErrorMessage(null);
    try {
      const accepted = await ingestSyntheticEvent(input);
      addActivity(audit("EVENT_INGESTED", `${input.eventType.replaceAll("_", " ")} · ${input.zone.zone_id}`, input.zone.zone_id));
      setSimulatorMessage(`Accepted ${accepted.event_id} · SYNTHETIC. Running worker…`);
      const processed = await processWorker();
      setSimulatorMessage(`Worker processed ${processed.processed_count} event${processed.processed_count === 1 ? "" : "s"}. Refreshing scores…`);
      setAsOfInput(freshLocalDateTime());
      const response = await refreshDashboard({ jurisdiction: jurisdictionId, selectedZones: zoneScope, cutoff: new Date().toISOString() });
      if (response) setSimulatorMessage(`Synthetic event processed. Snapshot ${response.snapshot_id.slice(0, 18)}…`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Synthetic event could not be processed.";
      setSimulatorMessage(message);
      setErrorMessage(message);
    } finally {
      setEventBusy(false);
    }
  };

  const handleInvestigatorAction = (action: InvestigatorAction, prediction: Prediction) => {
    const summary = `${prediction.zone_id} · ${prediction.horizon} · ${prediction.risk_band ?? "unbanded"}`;
    if (action === "publish") {
      const draft = prepareAlertDraft(prediction, snapshotId ?? "", jurisdictionId);
      setAlerts((current) => [draft, ...current]);
    }
    const actionType = auditActionFor(action);
    addActivity(audit(actionType, summary, prediction.zone_id));
  };

  const applyMockTransition = (alert: DemoAlert, transition: () => DemoAlert) => {
    try {
      const updated = transition();
      setAlerts((current) => current.map((item) => item.alertId === alert.alertId ? updated : item));
      addActivity(audit("ALERT_STATE_CHANGED", `${alert.alertId} · ${alert.state} → ${updated.state} · MOCK`, alert.zoneId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Mock alert transition failed.");
    }
  };

  return <DashboardShell>
    <header className="topbar">
      <div className="page-title"><span className="eyebrow">INTELLIGENCE / ZONE FORECASTS</span><h1>Investigator desk</h1></div>
      <div className="topbar-actions">
        <label className="jurisdiction-control"><span>Jurisdiction</span><select value={jurisdictionId} onChange={(event) => void changeJurisdiction(event.target.value)} aria-label="Jurisdiction">{jurisdictions.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
        <label className="asof-control"><span>As of</span><input type="datetime-local" value={asOfInput} onChange={(event) => setAsOfInput(event.target.value)} aria-label="Prediction as of time" /></label>
        <button className="button button-refresh" onClick={() => void refreshDashboard()} disabled={loading || !jurisdictionId} aria-label="Refresh predictions">{loading ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}{loading ? "Refreshing" : "Refresh"}</button>
      </div>
    </header>
    <div className={`demo-banner ${demoMode ? "demo-mode-active" : ""}`} role="status"><span className="demo-banner-icon"><Siren size={17} /></span><strong>SYNTHETIC DEMO DATA</strong><span>Simulated records only · Not real NCRP or financial institution data</span><span className="demo-banner-right"><ShieldCheck size={14} />No real-person or account data</span></div>

    <div className="page-content">
      {errorMessage && <div className={`api-alert ${loadState === "stale" ? "api-alert-stale" : ""}`} role="alert"><AlertCircle size={17} /><div><strong>{loadState === "stale" ? "Showing last available snapshot" : "Prediction service unavailable"}</strong><span>{errorMessage}</span></div><button className="icon-button" aria-label="Dismiss error" onClick={() => setErrorMessage(null)}>×</button></div>}
      <section className="overview-section" id="overview" aria-labelledby="overview-title">
        <div className="overview-heading"><div><span className="eyebrow">OPERATIONAL SNAPSHOT</span><h2 id="overview-title">Cash-out risk outlook</h2></div><div className="snapshot-meta"><span className={`sync-dot sync-${loadState}`} />{lastRefresh ? `Updated ${new Date(lastRefresh).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : loadState === "loading" ? "Loading prediction snapshot" : "No successful refresh"}<span className="snapshot-id mono">{snapshotId ?? "PREDICTION SET PENDING"}</span></div></div>
        <div className="overview-stats">
          {HORIZONS.map((horizon) => {
            const prediction = topByHorizon[horizon];
            return <RiskCard key={horizon} horizon={horizon} prediction={prediction} zone={zones.find((zone) => zone.zone_id === prediction?.zone_id)} active={activeHorizon === horizon} onSelect={() => { setActiveHorizon(horizon); if (prediction) setSelectedZoneId(prediction.zone_id); }} />;
          })}
          <div className="overview-stat compact-stat"><span><Database size={14} />ZONES EVALUATED</span><strong>{loadState === "loading" && !predictions.length ? "…" : evaluatedZoneCount}</strong><small>for current scope</small></div>
          <div className="overview-stat freshness-stat"><span><Waypoints size={14} />LIVE DATA</span><FreshnessIndicator state={liveFreshness} /><small>{liveFeatures.filter((feature) => feature.has_recent_data).length} active source zones</small></div>
        </div>
      </section>

      <section className="forecast-workspace" aria-label="Forecast analysis">
        <div className="workspace-heading">
          <div className="horizon-control" role="tablist" aria-label="Prediction horizon">{HORIZONS.map((horizon) => <button role="tab" aria-selected={activeHorizon === horizon} key={horizon} className={activeHorizon === horizon ? "active" : ""} onClick={() => setActiveHorizon(horizon)}>{horizon}</button>)}</div>
          <details className="zone-scope"><summary>Zone scope · {zoneScope.length ? `${zoneScope.length} selected` : `All ${zones.length}`}</summary><div className="scope-popover"><div className="scope-actions"><button onClick={() => setZoneScope([])}>All zones</button><button onClick={() => setZoneScope(zones.map((zone) => zone.zone_id))}>Select all</button></div>{zones.map((zone) => <label key={zone.zone_id}><input type="checkbox" checked={!zoneScope.length || zoneScope.includes(zone.zone_id)} onChange={(event) => setZoneScope((current) => {
            const selected = current.length ? current : zones.map((item) => item.zone_id);
            return event.target.checked ? [...new Set([...selected, zone.zone_id])] : selected.filter((id) => id !== zone.zone_id);
          })} />{zone.label}</label>)}<button className="scope-apply" onClick={() => void refreshDashboard()}>Apply scope</button></div></details>
          <details className="zone-scope horizon-scope"><summary>Horizons · {horizonScope.length} selected</summary><div className="scope-popover"><div className="scope-actions"><button onClick={() => setHorizonScope([...HORIZONS])}>All horizons</button></div>{HORIZONS.map((horizon) => <label key={horizon}><input type="checkbox" checked={horizonScope.includes(horizon)} onChange={(event) => setHorizonScope((current) => {
            if (event.target.checked) return HORIZONS.filter((value) => current.includes(value) || value === horizon);
            const next = current.filter((value) => value !== horizon);
            return next.length ? next : current;
          })} />{horizon}</label>)}<button className="scope-apply" onClick={() => { if (!horizonScope.includes(activeHorizon)) setActiveHorizon(horizonScope[0]); void refreshDashboard(); }}>Apply horizons</button></div></details>
          <span className="sort-note"><TrendingUp size={14} />Sorted by fused index</span>
        </div>
        {loadState === "loading" && !predictions.length ? <div className="loading-state"><LoaderCircle size={22} className="spin" /><span>Building jurisdiction forecast…</span></div> : loadState === "unavailable" && !predictions.length ? <div className="unavailable-state"><AlertCircle size={22} /><div><strong>Prediction API unavailable</strong><span>Start the TracePoint backend, then refresh this view.</span></div></div> : loadState === "empty" ? <div className="unavailable-state"><Database size={22} /><div><strong>No predictions returned</strong><span>Try another jurisdiction or clear the zone scope.</span></div></div> : <div className="analysis-grid">
          <ZoneMap zones={zones} predictions={predictions} liveFeatures={liveFeatures} horizon={activeHorizon} selectedZoneId={selectedZoneId} layer={mapLayer} onLayerChange={setMapLayer} onSelect={setSelectedZoneId} />
          <RankingTable horizon={activeHorizon} predictions={predictions} zones={zones} selectedZoneId={selectedZoneId} onSelect={setSelectedZoneId} />
        </div>}
      </section>

      <div className="investigation-grid">
        <ZoneEvidencePanel zone={selectedZone} prediction={selectedPrediction} liveFeature={selectedLiveFeature} horizon={activeHorizon} />
        <div className="workflow-column">
          <EventSimulator zones={zones} busy={eventBusy} result={simulatorMessage} onSubmit={handleSyntheticEvent} />
          <AlertPanel
            prediction={selectedPrediction}
            alerts={alerts}
            onAction={handleInvestigatorAction}
            onMockAdvance={(alert) => {
              const role = alert.state === "DRAFT" ? "INVESTIGATOR" : alert.state === "PUBLISHED" || alert.state === "ACKNOWLEDGED" ? "RESPONDER" : "REVIEWER";
              applyMockTransition(alert, () => mockAlertWorkflow.advance(alert, role));
            }}
            onMockDispute={(alert) => applyMockTransition(alert, () => mockAlertWorkflow.dispute(alert))}
            onMockExpire={(alert) => applyMockTransition(alert, () => mockAlertWorkflow.expire(alert))}
          />
        </div>
      </div>
      <ActivityPanel activity={activity} />
      <footer className="page-footer"><span>TRACEPOINT · PREDICTIVE CYBERCRIME INTELLIGENCE</span><span>Prioritization aid only · Human review required · No guilt or probability claim</span></footer>
    </div>
  </DashboardShell>;
}
