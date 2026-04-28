import type { MapData } from "@world-forge/shared";
import { formatPercent } from "../editor/editorState";

interface StatsPanelProps {
  mapData: MapData | null;
}

export function StatsPanel({ mapData }: StatsPanelProps) {
  return (
    <aside className="stats-panel" aria-label="Map statistics">
      <div>
        <span className="stat-label">mapHash</span>
        <strong className="hash-value">{mapData?.mapHash ?? "pending"}</strong>
      </div>
      <dl className="stats-grid">
        <Stat label="Water" value={mapData ? formatPercent(mapData.stats.waterRatio) : "-"} />
        <Stat label="Land" value={mapData ? formatPercent(mapData.stats.landRatio) : "-"} />
        <Stat label="Forest" value={mapData ? formatPercent(mapData.stats.forestRatio) : "-"} />
        <Stat label="Mountain" value={mapData ? formatPercent(mapData.stats.mountainRatio) : "-"} />
        <Stat label="Blocked" value={mapData ? formatPercent(mapData.stats.blockedRatio) : "-"} />
        <Stat label="Gen ms" value={mapData ? mapData.stats.generationTimeMs.toFixed(1) : "-"} />
      </dl>
    </aside>
  );
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="stat-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
