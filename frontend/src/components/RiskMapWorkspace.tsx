import { Layers, ShieldCheck } from "lucide-react";
import type { Horizon, LiveFeature, MapLayer, Prediction, Zone } from "../types";
import { ZoneEvidencePanel } from "./ZoneEvidencePanel";
import { ZoneMap } from "./ZoneMap";

export function RiskMapWorkspace({
  zones,
  predictions,
  liveFeatures,
  horizon,
  onHorizonChange,
  selectedZoneId,
  onSelectZone,
  layer,
  onLayerChange,
}: {
  zones: Zone[];
  predictions: Prediction[];
  liveFeatures: LiveFeature[];
  horizon: Horizon;
  onHorizonChange: (h: Horizon) => void;
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  layer: MapLayer;
  onLayerChange: (layer: MapLayer) => void;
}) {
  const selectedZone = zones.find((z) => z.zone_id === selectedZoneId);
  const selectedPrediction = predictions.find((p) => p.zone_id === selectedZoneId && p.horizon === horizon);
  const selectedLiveFeature = liveFeatures.find((f) => f.zone_id === selectedZoneId);

  return (
    <div className="risk-map-workspace">
      {/* Map Control Bar */}
      <div className="risk-map-toolbar">
        <div className="toolbar-group">
          <span className="toolbar-label">FORECAST HORIZON:</span>
          <div className="horizon-control" role="tablist" aria-label="Risk map horizon">
            {(["+2h", "+6h", "+24h"] as const).map((h) => (
              <button
                key={h}
                role="tab"
                aria-selected={horizon === h}
                className={horizon === h ? "active" : ""}
                onClick={() => onHorizonChange(h)}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-label"><Layers size={13} /> MAP LAYER:</span>
          <div className="layer-button-group">
            {(["fused", "historical", "live", "activity"] as const).map((l) => (
              <button
                key={l}
                className={`layer-btn ${layer === l ? "active" : ""}`}
                onClick={() => onLayerChange(l)}
              >
                {l === "fused" ? "Fused Risk (F)" : l === "historical" ? "Historical (H)" : l === "live" ? "Live Activity (L)" : "Event Density"}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-status">
          <span className="badge badge-synthetic"><ShieldCheck size={12} />ZONE-LEVEL RESOLUTION</span>
        </div>
      </div>

      {/* Main Map + Side Drawer Split View */}
      <div className="risk-map-split">
        <div className="risk-map-main-view">
          <ZoneMap
            zones={zones}
            predictions={predictions}
            liveFeatures={liveFeatures}
            horizon={horizon}
            selectedZoneId={selectedZoneId}
            layer={layer}
            onLayerChange={onLayerChange}
            onSelect={onSelectZone}
          />
        </div>

        {/* Dedicated Zone Intelligence Drawer */}
        <div className="risk-map-drawer">
          <div className="drawer-header">
            <div>
              <span className="eyebrow">SELECTED SPATIAL TARGET</span>
              <h3>{selectedZone ? selectedZone.label : "Zone Intelligence"}</h3>
            </div>
            <span className="mono text-muted">{selectedZoneId ?? "NO ZONE"}</span>
          </div>

          <ZoneEvidencePanel
            zone={selectedZone}
            prediction={selectedPrediction}
            liveFeature={selectedLiveFeature}
            horizon={horizon}
          />
        </div>
      </div>
    </div>
  );
}
