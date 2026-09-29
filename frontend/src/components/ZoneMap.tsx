import { Activity, Crosshair, MapPinned } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { Horizon, LiveFeature, MapLayer, Prediction, Zone } from "../types";

const layers: { id: MapLayer; label: string }[] = [
  { id: "fused", label: "Fused" }, { id: "historical", label: "Historical H" },
  { id: "live", label: "Live L" }, { id: "activity", label: "Observed activity" },
];

function metric(prediction: Prediction | undefined, live: LiveFeature | undefined, layer: MapLayer): number | null {
  if (layer === "fused") return prediction?.fused_score_f ?? null;
  if (layer === "historical") return prediction?.historical_score_h ?? null;
  if (layer === "live") return prediction?.live_score_l ?? null;
  return live?.has_recent_data ? Math.min(1, live.recent_event_count / 8) : 0;
}

function fillFor(value: number | null, layer: MapLayer): string {
  if (value === null) return "#c8cfca";
  if (layer === "live") return value >= 0.65 ? "#087f72" : value >= 0.3 ? "#28a28f" : "#82c9b8";
  if (layer === "historical") return value >= 0.65 ? "#b86f12" : value >= 0.3 ? "#d79b3d" : "#edc97d";
  if (layer === "activity") return value > 0 ? "#d7683f" : "#c8cfca";
  return value >= 0.75 ? "#c44138" : value >= 0.5 ? "#d56b4e" : value >= 0.25 ? "#dc9b54" : "#82a89b";
}

export function ZoneMap({ zones, predictions, liveFeatures, horizon, selectedZoneId, layer, onLayerChange, onSelect }: {
  zones: Zone[];
  predictions: Prediction[];
  liveFeatures: LiveFeature[];
  horizon: Horizon;
  selectedZoneId: string | null;
  layer: MapLayer;
  onLayerChange: (layer: MapLayer) => void;
  onSelect: (zoneId: string) => void;
}) {
  const extents = useMemo(() => {
    const points = zones.flatMap((zone) => zone.centroid ? [zone.centroid] : []);
    return {
      minLat: Math.min(...points.map((point) => point.lat)), maxLat: Math.max(...points.map((point) => point.lat)),
      minLon: Math.min(...points.map((point) => point.lon)), maxLon: Math.max(...points.map((point) => point.lon)),
    };
  }, [zones]);
  const byZone = new Map(predictions.filter((row) => row.horizon === horizon).map((row) => [row.zone_id, row]));
  const liveByZone = new Map(liveFeatures.map((row) => [row.zone_id, row]));

  return (
    <section className="map-section" id="risk-map" aria-labelledby="map-title">
      <div className="section-heading map-heading">
        <div><span className="eyebrow">SPATIAL PRIORITIZATION</span><h2 id="map-title">Zone activity map</h2></div>
        <span className="map-geolabel"><MapPinned size={14} />SYNTHETIC ZONE CENTROIDS</span>
      </div>
      <div className="map-tools" role="group" aria-label="Map layer">
        {layers.map((item) => <button key={item.id} className={`layer-button ${layer === item.id ? "active" : ""}`} onClick={() => onLayerChange(item.id)} aria-pressed={layer === item.id}>{item.label}</button>)}
      </div>
      <div className="map-canvas" role="region" aria-label={`Synthetic zone centroid map, ${layer} layer, ${horizon}`}>
        <div className="map-coordinate map-coordinate-nw">31°N</div><div className="map-coordinate map-coordinate-se">72°E — 86°E</div>
        <div className="map-grid-lines" aria-hidden="true" />
        {zones.map((zone) => {
          if (!zone.centroid || !Number.isFinite(extents.minLat)) return null;
          const x = 10 + ((zone.centroid.lon - extents.minLon) / Math.max(0.01, extents.maxLon - extents.minLon)) * 78;
          const y = 12 + (1 - (zone.centroid.lat - extents.minLat) / Math.max(0.01, extents.maxLat - extents.minLat)) * 70;
          const prediction = byZone.get(zone.zone_id);
          const live = liveByZone.get(zone.zone_id);
          const value = metric(prediction, live, layer);
          const activity = Boolean(live?.has_recent_data);
          return <button
            key={zone.zone_id}
            className={`map-point ${selectedZoneId === zone.zone_id ? "map-point-selected" : ""} ${activity ? "map-point-observed" : ""}`}
            style={{ left: `${x}%`, top: `${y}%`, "--point-fill": fillFor(value, layer) } as CSSProperties}
            onClick={() => onSelect(zone.zone_id)}
            aria-label={`${zone.label}, ${layer} ${value === null ? "unavailable" : value.toFixed(3)}, ${live?.recent_event_count ?? 0} recent events`}
            title={`${zone.label} · synthetic centroid`}
          >
            <span className="point-ring" /><span className="point-dot">{layer === "activity" ? <Activity size={16} /> : value === null ? "—" : value.toFixed(2)}</span>
            <span className="map-point-label">{zone.zone_id.replace("SYN-ZONE-", "Z-")}</span>
          </button>;
        })}
        {zones.length === 0 && <div className="map-empty"><Crosshair size={22} /><span>No zone catalogue for this jurisdiction</span></div>}
        <span className="map-watermark">DEMO GEOGRAPHY / NO INCIDENT COORDINATES</span>
      </div>
      <div className="map-legend">
        <span><i className="legend-fused" />Selected layer score</span>
        <span><i className="legend-live" />Live propagation ring</span>
        <span><i className="legend-observed" />Recent observed activity</span>
      </div>
    </section>
  );
}
