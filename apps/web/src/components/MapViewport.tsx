import type { MapData, ViewMode } from "@world-forge/shared";
import { viewModes } from "../editor/editorState";
import { statusLabel } from "../i18n/korean";
import { HeightMapView, SideMapView, TerrainMapView } from "../renderers/canvasRenderers";

interface MapViewportProps {
  mapData: MapData | null;
  viewMode: ViewMode;
  status: string;
  error: string | null;
  onViewModeChange: (viewMode: ViewMode) => void;
}

export function MapViewport({ mapData, viewMode, status, error, onViewModeChange }: MapViewportProps) {
  return (
    <section className="map-workspace" aria-label="지도 미리보기">
      <div className="workspace-toolbar">
        <div className="view-tabs" role="tablist" aria-label="보기 방식">
          {viewModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={mode.value === viewMode ? "active" : ""}
              onClick={() => onViewModeChange(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <span className="status-pill">{statusLabel(status)}</span>
      </div>

      <div className="canvas-frame">
        {mapData ? renderMapView(mapData, viewMode) : <div className="empty-preview">먼저 세계를 빚어주세요</div>}
      </div>

      {error ? <p className="error-line">{error}</p> : null}
    </section>
  );
}

function renderMapView(mapData: MapData, viewMode: ViewMode) {
  switch (viewMode) {
    case "terrain-2d":
      return <TerrainMapView mapData={mapData} />;
    case "height-map":
      return <HeightMapView mapData={mapData} />;
    case "side-view":
      return <SideMapView mapData={mapData} />;
  }
}
