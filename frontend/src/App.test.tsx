import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as api from "./api";
import { MockAlertWorkflowAdapter } from "./services/blockchain/mockAdapter";
import { createSnapshotCommitment, resolveMstChainConfig } from "./services/blockchain/adapters";
import type { Prediction, PredictionResponse, Zone } from "./types";

vi.mock("./api", () => ({
  getAllZones: vi.fn(),
  bootstrapSyntheticDemo: vi.fn(),
  getZones: vi.fn(),
  getLiveFeatures: vi.fn(),
  getPredictions: vi.fn(),
  ingestSyntheticEvent: vi.fn(),
  processWorker: vi.fn(),
}));

const zones: Zone[] = [
  { zone_id: "SYN-ZONE-001", jurisdiction_id: "SYN-JUR-01", label: "Synthetic Zone 001", centroid: { lat: 29.1, lon: 78.1 }, source_class: "SYNTHETIC", active: true },
  { zone_id: "SYN-ZONE-005", jurisdiction_id: "SYN-JUR-01", label: "Synthetic Zone 005", centroid: { lat: 28.8, lon: 77.8 }, source_class: "SYNTHETIC", active: true },
];

function prediction(zone: Zone, horizon: Prediction["horizon"], rank: number, fused: number): Prediction {
  return {
    prediction_id: `${zone.zone_id}-${horizon}`,
    zone_id: zone.zone_id,
    horizon,
    as_of: "2026-09-29T10:15:00Z",
    window_start: "2026-09-29T10:15:00Z",
    window_end: "2026-09-29T12:15:00Z",
    historical_score_h: 0.35,
    live_score_l: 0.42,
    fused_score_f: fused,
    rank,
    risk_band: fused >= 0.5 ? "HIGH" : "MEDIUM",
    score_semantics: "RELATIVE_RISK_INDEX",
    model_version: "synthetic-test-model",
    fusion_version: "test-fusion-v1",
    source_provenance: ["SYNTHETIC"],
    synthetic_only: true,
    feature_as_of: "2026-09-29T10:15:00Z",
    last_event_at: "2026-09-29T10:12:00Z",
    data_quality: { quality_gate: "PASS", freshness: "CURRENT", live_data_exists: true, missing_components: [] },
    uncertainty: null,
    explanation: {
      historical: { score: 0.35, contribution: 0.16, score_semantics: "UNCALIBRATED_RAW_MODEL_SCORE", feature_event_count: 2 },
      live: { score: 0.42, contribution: 0.23, ruleset_version: "test-live-v1", indicators: { recent_event_count: 2, distinct_event_count: 2, amount_band_counts: { BAND_4: 1 } }, freshness: "CURRENT" },
      weights: { historical: 0.45, live: 0.55 },
    },
  };
}

const predictions: Prediction[] = [
  ...zones.map((zone, index) => prediction(zone, "+2h", index + 1, index === 0 ? 0.72 : 0.38)),
  ...zones.map((zone, index) => prediction(zone, "+6h", index === 0 ? 2 : 1, index === 0 ? 0.44 : 0.66)),
  ...zones.map((zone, index) => prediction(zone, "+24h", index + 1, index === 0 ? 0.35 : 0.31)),
];

const response: PredictionResponse = { snapshot_id: "PREDSET-test123", as_of: "2026-09-29T10:15:00Z", predictions };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAllZones).mockResolvedValue({ zones });
  vi.mocked(api.bootstrapSyntheticDemo).mockResolvedValue({ seeded: false, processed_count: 0, reason: "RECENT_LIVE_DATA_EXISTS" });
  vi.mocked(api.getZones).mockResolvedValue({ zones, source_provenance: ["SYNTHETIC"], synthetic_only: true });
  vi.mocked(api.getLiveFeatures).mockResolvedValue({
    as_of: response.as_of,
    zones: zones.map((zone, index) => ({
      zone_id: zone.zone_id, recent_event_count: index ? 0 : 2, distinct_event_count: index ? 0 : 2,
      amount_band_counts: { BAND_4: index ? 0 : 1 }, provenance_counts: { SYNTHETIC: index ? 0 : 2 },
      last_event_at: index ? null : "2026-09-29T10:12:00Z", latest_processed_at: null,
      has_recent_data: !index, as_of: response.as_of,
    })),
  });
  vi.mocked(api.getPredictions).mockResolvedValue(response);
  vi.mocked(api.ingestSyntheticEvent).mockResolvedValue({ event_id: "EVT-demo", status: "ACCEPTED", provenance: "SYNTHETIC", received_at: response.as_of, duplicate: false });
  vi.mocked(api.processWorker).mockResolvedValue({ generation: 1, processed_count: 1, event_ids: ["EVT-demo"] });
});

describe("investigator dashboard", () => {
  it("renders prediction response and the synthetic-data boundary", async () => {
    render(<App />);
    expect(await screen.findByText("SYNTHETIC DEMO DATA")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Zone ranking" })).toBeInTheDocument();
    expect(screen.getAllByText("SYN-ZONE-001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.720").length).toBeGreaterThan(0);
    expect(screen.getByText("Scores are relative prioritization indices, not probabilities.")).toBeInTheDocument();
  });

  it("switches horizon and changes the ranked zone view", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Zone ranking" });
    fireEvent.click(screen.getByRole("tab", { name: "+6h" }));
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("Synthetic Zone 005")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "+6h" })).toHaveAttribute("aria-selected", "true");
  });

  it("sends the selected horizon subset on refresh", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Zone ranking" });
    fireEvent.click(screen.getByText("Horizons · 3 selected"));
    fireEvent.click(screen.getByLabelText("+6h"));
    fireEvent.click(screen.getByRole("button", { name: "Apply horizons" }));
    await waitFor(() => expect(api.getPredictions).toHaveBeenCalledTimes(2));
    expect(api.getPredictions).toHaveBeenLastCalledWith(expect.objectContaining({ horizons: ["+2h", "+24h"] }));
  });

  it("submits synthetic event, runs worker, then refreshes the predictions", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Zone ranking" });
    fireEvent.click(screen.getByRole("button", { name: "Ingest and refresh" }));
    await waitFor(() => expect(api.ingestSyntheticEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "TRANSACTION_SIGNAL", amountBand: "BAND_4" })));
    await waitFor(() => expect(api.processWorker).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.getPredictions).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Synthetic event processed/)).toBeInTheDocument();
  });

  it("prepares an application-only alert draft without a blockchain call", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Zone ranking" });
    fireEvent.click(screen.getByRole("button", { name: "Publish Alert" }));
    expect(await screen.findByText("DRAFT", { selector: ".draft-state" })).toBeInTheDocument();
    expect(screen.getByText(/No MST transaction is submitted/)).toBeInTheDocument();
    expect(api.ingestSyntheticEvent).not.toHaveBeenCalled();
  });

  it("renders the complete mock alert lifecycle in the investigator panel", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Zone ranking" });
    fireEvent.click(screen.getByRole("button", { name: "Publish Alert" }));
    fireEvent.click(await screen.findByRole("button", { name: "Advance mock lifecycle to PUBLISHED" }));
    fireEvent.click(await screen.findByRole("button", { name: "Advance mock lifecycle to ACKNOWLEDGED" }));
    fireEvent.click(await screen.findByRole("button", { name: "Advance mock lifecycle to ACTION_COMMITTED" }));
    fireEvent.click(await screen.findByRole("button", { name: "Advance mock lifecycle to RESOLVED" }));
    expect(await screen.findByText("MOCK LIFECYCLE COMPLETE")).toBeInTheDocument();
    expect(screen.getByText(/ACTION_COMMITTED → RESOLVED · MOCK/)).toBeInTheDocument();
  });

  it("demonstrates a complete role-checked mock alert lifecycle", async () => {
    const workflow = new MockAlertWorkflowAdapter();
    const draft = {
      alertId: "ALT-local", predictionId: "PRED-local", zoneId: zones[0].zone_id,
      horizon: "+2h" as const, riskBand: "HIGH" as const, state: "DRAFT" as const,
      preparedAt: response.as_of, fusionVersion: "fusion-v1", snapshotId: response.snapshot_id,
      modelVersion: "model-v1", jurisdictionId: "SYN-JUR-01",
    };
    const published = workflow.advance(draft, "INVESTIGATOR");
    const acknowledged = workflow.advance(published, "RESPONDER");
    const committed = workflow.advance(acknowledged, "RESPONDER");
    const resolved = workflow.advance(committed, "REVIEWER");
    expect([published.state, acknowledged.state, committed.state, resolved.state]).toEqual([
      "PUBLISHED", "ACKNOWLEDGED", "ACTION_COMMITTED", "RESOLVED",
    ]);
    expect(() => workflow.advance(published, "INVESTIGATOR")).toThrow("RESPONDER role required");
  });

  it("supports dispute and expiry branches in mock mode", () => {
    const workflow = new MockAlertWorkflowAdapter();
    const draft = {
      alertId: "ALT-dispute", predictionId: "PRED-local", zoneId: zones[0].zone_id,
      horizon: "+2h" as const, riskBand: "HIGH" as const, state: "DRAFT" as const,
      preparedAt: response.as_of, fusionVersion: "fusion-v1", snapshotId: response.snapshot_id,
      modelVersion: "model-v1", jurisdictionId: "SYN-JUR-01",
    };
    const published = workflow.advance(draft, "INVESTIGATOR");
    expect(workflow.dispute(published).state).toBe("DISPUTED");
    expect(workflow.expire(published).state).toBe("EXPIRED");
  });

  it("defaults blockchain configuration to mock and refuses incomplete testnet config", () => {
    expect(resolveMstChainConfig({})).toEqual({ mode: "mock" });
    expect(() => resolveMstChainConfig({ VITE_TRACEPOINT_CHAIN_MODE: "testnet" })).toThrow("requires VITE_MST_RPC_URL");
    expect(() => resolveMstChainConfig({
      VITE_TRACEPOINT_CHAIN_MODE: "testnet",
      VITE_MST_RPC_URL: "file:///tmp/rpc",
      VITE_MST_CHAIN_ID: "1",
      VITE_MST_ALERTS_CONTRACT_ADDRESS: "invalid",
    })).toThrow("MST chain ID or contract address is invalid.");
  });

  it("creates salted snapshot commitments without exposing the nonce on chain", () => {
    const first = createSnapshotCommitment('{"prediction":"off-chain"}');
    const second = createSnapshotCommitment('{"prediction":"off-chain"}');
    expect(first.commitment).toMatch(/^0x[\da-f]{64}$/i);
    expect(first.nonce).toMatch(/^0x[\da-f]{64}$/i);
    expect(first.commitment).not.toBe(second.commitment);
    expect(first.nonce).not.toBe(first.commitment);
  });

  it("builds valid publish commitments from an alert draft", async () => {
    const { createPublishCommitments } = await import("./services/alertWorkflow");
    const draft = {
      alertId: "ALT-comm-test",
      predictionId: "PRED-1",
      zoneId: "ZONE-1",
      horizon: "+2h" as const,
      riskBand: "HIGH" as const,
      state: "DRAFT" as const,
      preparedAt: new Date().toISOString(),
      fusionVersion: "fusion-v1",
      snapshotId: "SNAP-1",
      modelVersion: "model-v1",
      jurisdictionId: "SYN-JUR-01",
    };
    const { commitments, nonce } = createPublishCommitments(draft, 1700000000);
    expect(commitments.jurisdictionId).toBe("SYN-JUR-01");
    expect(commitments.snapshotCommitment).toMatch(/^0x[\da-f]{64}$/i);
    expect(commitments.offchainRef).toMatch(/^0x[\da-f]{64}$/i);
    expect(commitments.expiry).toBe(1700000000 + 86400);
    expect(commitments.responseDeadline).toBe(1700000000 + 7200);
    expect(nonce).toMatch(/^0x[\da-f]{64}$/i);
  });

  it("connects through an injected EVM provider without asking for key material", async () => {
    const account = "0x1234567890123456789012345678901234567890";
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return "0x7a69";
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      throw new Error(`Unexpected wallet request: ${method}`);
    });
    const { BridgeKeySigner } = await import("./services/blockchain/adapters");
    const signer = new BridgeKeySigner({ request });
    await expect(signer.connect(31337n)).resolves.toBe(account);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_requestAccounts" }));
    expect(request.mock.calls.some(([arg]) => /private|seed|password/i.test(arg.method))).toBe(false);
  });

  it("handles chain mismatch by requesting network switch", async () => {
    const account = "0x1234567890123456789012345678901234567890";
    let chainIdHex = "0x1"; // start on mainnet
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return chainIdHex;
      if (method === "wallet_switchEthereumChain") {
        chainIdHex = "0x5752035"; // switched to 91562037
        return null;
      }
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      throw new Error(`Unexpected wallet request: ${method}`);
    });
    const { BridgeKeySigner } = await import("./services/blockchain/adapters");
    const signer = new BridgeKeySigner({ request });
    await expect(signer.connect(91562037n)).resolves.toBe(account);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x5752035" }],
    }));
  });

  it("shows each mock lifecycle transition from the alert panel", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Zone ranking" });
    fireEvent.click(screen.getByRole("button", { name: "Publish Alert" }));
    fireEvent.click(await screen.findByRole("button", { name: "Advance mock lifecycle to PUBLISHED" }));
    fireEvent.click(await screen.findByRole("button", { name: "Advance mock lifecycle to ACKNOWLEDGED" }));
    fireEvent.click(await screen.findByRole("button", { name: "Advance mock lifecycle to ACTION_COMMITTED" }));
    fireEvent.click(await screen.findByRole("button", { name: "Advance mock lifecycle to RESOLVED" }));
    expect(await screen.findByText("MOCK LIFECYCLE COMPLETE")).toBeInTheDocument();
    expect(screen.getByText(/ACTION_COMMITTED → RESOLVED · MOCK/)).toBeInTheDocument();
  });

  it("shows API loading and unavailable states", async () => {
    vi.mocked(api.getAllZones).mockRejectedValueOnce(new Error("backend offline"));
    render(<App />);
    expect(await screen.findByText("Prediction API unavailable")).toBeInTheDocument();
    expect(screen.getByText("backend offline")).toBeInTheDocument();
  });

  it("keeps an explicit loading state while prediction requests are pending", async () => {
    vi.mocked(api.getPredictions).mockReturnValue(new Promise(() => undefined));
    render(<App />);
    expect(await screen.findByText("Loading prediction snapshot")).toBeInTheDocument();
    expect(screen.getByText("Building jurisdiction forecast…")).toBeInTheDocument();
  });
});
