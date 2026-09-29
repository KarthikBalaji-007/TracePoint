import type { EventType, Horizon, LiveFeature, PredictionResponse, Zone } from "./types";

const REQUEST_TIMEOUT_MS = 9000;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof body.detail === "string" ? body.detail : `Request failed (${response.status})`;
      throw new Error(detail);
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("TracePoint API timed out. Check that the local backend is running.");
    }
    if (error instanceof TypeError) {
      throw new Error("TracePoint API is unavailable. Start the local backend and retry.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getZones(jurisdictionId: string): Promise<{ zones: Zone[]; source_provenance: string[]; synthetic_only: boolean }> {
  return request(`/api/v1/zones?jurisdiction_id=${encodeURIComponent(jurisdictionId)}`);
}

export function getAllZones(): Promise<{ zones: Zone[] }> {
  return request("/api/v1/zones");
}

export function bootstrapSyntheticDemo(jurisdictionId: string): Promise<{
  seeded: boolean;
  event_id?: string;
  zone_id?: string;
  provenance?: string;
  processed_count: number;
  reason: string;
}> {
  return request("/api/v1/demo/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jurisdiction_id: jurisdictionId }),
  });
}

export function getLiveFeatures(asOf?: string): Promise<{ zones: LiveFeature[]; as_of: string }> {
  const suffix = asOf ? `?window_minutes=180&as_of=${encodeURIComponent(asOf)}` : "?window_minutes=180";
  return request(`/api/v1/live-features${suffix}`);
}

export function getPredictions(input: {
  jurisdiction_id: string;
  zone_ids?: string[];
  horizons: Horizon[];
  as_of: string;
}): Promise<PredictionResponse> {
  return request("/api/v1/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function ingestSyntheticEvent(input: {
  zone: Zone;
  eventType: EventType;
  amountBand: string;
  channel: string;
  category: string;
}): Promise<{ event_id: string; status: string; provenance: string; received_at: string; duplicate: boolean }> {
  const key = crypto.randomUUID();
  return request("/api/v1/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Source-Scope": "tracepoint-dashboard-demo" },
    body: JSON.stringify({
      source_event_id: `DEMO-${key}`,
      event_type: input.eventType,
      event_time: new Date().toISOString(),
      jurisdiction_id: input.zone.jurisdiction_id,
      zone_id: input.zone.zone_id,
      amount_band: input.amountBand,
      channel: input.channel,
      category: input.category,
      correlation_ref: `DEMO-CASE-${key}`,
      provenance: "SYNTHETIC",
      idempotency_key: `dashboard:${key}`,
    }),
  });
}

export function processWorker(): Promise<{ generation: number; processed_count: number; event_ids: string[] }> {
  return request("/api/v1/worker/process", { method: "POST" });
}
