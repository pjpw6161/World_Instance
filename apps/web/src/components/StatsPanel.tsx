import type { MapData } from "@world-forge/shared";
import { formatPercent } from "../editor/editorState";

interface StatsPanelProps {
  mapData: MapData | null;
}

export function StatsPanel({ mapData }: StatsPanelProps) {
  return (
    <aside className="stats-panel" aria-label="지도 수치">
      <div>
        <span className="stat-label">지도 인장값</span>
        <strong className="hash-value">{mapData?.mapHash ?? "아직 없음"}</strong>
      </div>
      <dl className="stats-grid">
        <Stat label="물" value={mapData ? formatPercent(mapData.stats.waterRatio) : "-"} />
        <Stat label="육지" value={mapData ? formatPercent(mapData.stats.landRatio) : "-"} />
        <Stat label="숲" value={mapData ? formatPercent(mapData.stats.forestRatio) : "-"} />
        <Stat label="산악" value={mapData ? formatPercent(mapData.stats.mountainRatio) : "-"} />
        <Stat label="막힌 곳" value={mapData ? formatPercent(mapData.stats.blockedRatio) : "-"} />
        <Stat label="생성 ms" value={mapData ? mapData.stats.generationTimeMs.toFixed(1) : "-"} />
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
