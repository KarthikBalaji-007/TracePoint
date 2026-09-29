import { Activity, Crosshair, MapPinned, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { Horizon, LiveFeature, MapLayer, Prediction, Zone } from "../types";

const layers: { id: MapLayer; label: string }[] = [
  { id: "fused", label: "Fused" },
  { id: "historical", label: "Historical H" },
  { id: "live", label: "Live L" },
  { id: "activity", label: "Observed activity" },
];

function metric(prediction: Prediction | undefined, live: LiveFeature | undefined, layer: MapLayer): number | null {
  if (layer === "fused") return prediction?.fused_score_f ?? null;
  if (layer === "historical") return prediction?.historical_score_h ?? null;
  if (layer === "live") return prediction?.live_score_l ?? null;
  return live?.has_recent_data ? Math.min(1, live.recent_event_count / 8) : 0;
}

function fillFor(value: number | null, layer: MapLayer): string {
  if (value === null) return "#475569";
  if (layer === "live") return value >= 0.65 ? "#06b6d4" : value >= 0.3 ? "#0891b2" : "#155e75";
  if (layer === "historical") return value >= 0.65 ? "#f59e0b" : value >= 0.3 ? "#d97706" : "#78350f";
  if (layer === "activity") return value > 0 ? "#f97316" : "#475569";
  return value >= 0.75 ? "#ef4444" : value >= 0.5 ? "#f97316" : value >= 0.25 ? "#eab308" : "#10b981";
}

function ringColorFor(value: number | null): string {
  if (value === null) return "rgba(100, 116, 139, 0.4)";
  if (value >= 0.75) return "rgba(239, 68, 68, 0.6)";
  if (value >= 0.5) return "rgba(249, 115, 22, 0.6)";
  if (value >= 0.25) return "rgba(234, 179, 8, 0.5)";
  return "rgba(16, 185, 129, 0.5)";
}

export function ZoneMap({
  zones,
  predictions,
  liveFeatures,
  horizon,
  selectedZoneId,
  layer,
  onLayerChange,
  onSelect,
}: {
  zones: Zone[];
  predictions: Prediction[];
  liveFeatures: LiveFeature[];
  horizon: Horizon;
  selectedZoneId: string | null;
  layer: MapLayer;
  onLayerChange: (layer: MapLayer) => void;
  onSelect: (zoneId: string) => void;
}) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const extents = useMemo(() => {
    const points = zones.flatMap((zone) => (zone.centroid ? [zone.centroid] : []));
    if (!points.length) return { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 };
    return {
      minLat: Math.min(...points.map((point) => point.lat)),
      maxLat: Math.max(...points.map((point) => point.lat)),
      minLon: Math.min(...points.map((point) => point.lon)),
      maxLon: Math.max(...points.map((point) => point.lon)),
    };
  }, [zones]);

  const byZone = new Map(predictions.filter((row) => row.horizon === horizon).map((row) => [row.zone_id, row]));
  const liveByZone = new Map(liveFeatures.map((row) => [row.zone_id, row]));

  const handleZoomIn = () => setZoomLevel((z) => Math.min(2.5, z + 0.25));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.8, z - 0.25));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <section className="map-section" id="risk-map" aria-labelledby="map-title">
      <div className="section-heading map-heading">
        <div>
          <span className="eyebrow">SPATIAL PRIORITIZATION</span>
          <h2 id="map-title">Zone activity map</h2>
        </div>
        <span className="map-geolabel">
          <MapPinned size={14} />
          SYNTHETIC ZONE CENTROIDS
        </span>
      </div>

      <div className="map-controls-bar">
        <div className="map-tools" role="group" aria-label="Map layer">
          {layers.map((item) => (
            <button
              key={item.id}
              className={`layer-button ${layer === item.id ? "active" : ""}`}
              onClick={() => onLayerChange(item.id)}
              aria-pressed={layer === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Tactical Map Zoom & Pan Controls */}
        <div className="map-zoom-controls">
          <button className="map-zoom-btn" onClick={handleZoomIn} title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={14} />
          </button>
          <span className="zoom-indicator mono">{Math.round(zoomLevel * 100)}%</span>
          <button className="map-zoom-btn" onClick={handleZoomOut} title="Zoom out" aria-label="Zoom out">
            <ZoomOut size={14} />
          </button>
          <button className="map-zoom-btn" onClick={handleResetZoom} title="Reset zoom and center" aria-label="Reset zoom">
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      <div
        className="map-canvas"
        role="region"
        aria-label={`Synthetic zone centroid map, ${layer} layer, ${horizon}`}
      >
        <div className="map-coordinate map-coordinate-nw">12.97°N · 77.59°E</div>
        <div className="map-coordinate map-coordinate-se">URBAN SECTOR GRID</div>
        <div className="map-grid-lines" aria-hidden="true" />
        <div className="radar-sweep" aria-hidden="true" />

        <div
          className="map-content-layer"
          style={{
            transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
            transformOrigin: "center center",
            transition: "transform 0.15s ease-out",
          }}
        >
          {zones.map((zone) => {
            if (!zone.centroid || !Number.isFinite(extents.minLat)) return null;
            const lonRange = Math.max(0.01, extents.maxLon - extents.minLon);
            const latRange = Math.max(0.01, extents.maxLat - extents.minLat);
            const x = 12 + ((zone.centroid.lon - extents.minLon) / lonRange) * 74;
            const y = 14 + (1 - (zone.centroid.lat - extents.minLat) / latRange) * 68;
            const prediction = byZone.get(zone.zone_id);
            const live = liveByZone.get(zone.zone_id);
            const value = metric(prediction, live, layer);
            const activity = Boolean(live?.has_recent_data);
            const isSelected = selectedZoneId === zone.zone_id;

            return (
              <button
                key={zone.zone_id}
                className={`map-point ${isSelected ? "map-point-selected" : ""} ${activity ? "map-point-observed" : ""}`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  "--point-fill": fillFor(value, layer),
                  "--ring-color": ringColorFor(value),
                } as CSSProperties}
                onClick={() => onSelect(zone.zone_id)}
                aria-label={`${zone.label}, ${layer} ${value === null ? "unavailable" : value.toFixed(3)}, ${live?.recent_event_count ?? 0} recent events`}
                title={`${zone.label} · Synthetic Zone Centroid`}
              >
                <span className="point-ring" />
                <span className="point-dot">
                  {layer === "activity" ? (
                    <Activity size={14} />
                  ) : value === null ? (
                    "—"
                  ) : (
                    value.toFixed(2)
                  )}
                </span>
                <span className="map-point-label">
                  {zone.zone_id.replace("SYN-ZONE-", "Z-")}
                </span>
                {isSelected && <span className="selected-indicator-crosshair" />}
              </button>
            );
          })}
        </div>

        {zones.length === 0 && (
          <div className="map-empty">
            <Crosshair size={22} />
            <span>No zone catalogue for this jurisdiction</span>
          </div>
        )}

        <span className="map-watermark">DEMO GEOGRAPHY · ZONE-LEVEL RISK ONLY · NO EXACT ATM COORDINATES</span>
      </div>

      <div className="map-legend">
        <span><i className="legend-fused" />Selected layer score</span>
        <span><i className="legend-live" />Live propagation ring</span>
        <span><i className="legend-observed" />Recent observed activity</span>
        <span className="legend-scale mono">1 km : 12 px (approx)</span>
      </div>
    </section>
  );
}
