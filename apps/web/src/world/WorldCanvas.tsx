import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { MapData } from "@world-forge/shared";
import { hitTestWorldMapAnnotation, renderWorldMap, type WorldMapAnnotationHit, type WorldMapViewMode } from "./worldMapRenderer";
import type { WorldIdentity } from "./worldIdentity";
import type { WorldEntity } from "./worldState";

interface WorldCanvasProps {
  mapData: MapData;
  entities: readonly WorldEntity[];
  activeLayerId: string;
  mode: WorldMapViewMode;
  identity?: WorldIdentity | null;
}

interface WorldMapTooltipState extends WorldMapAnnotationHit {
  leftPercent: number;
  topPercent: number;
}

export function WorldCanvas({ mapData, entities, activeLayerId, mode, identity }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tooltip, setTooltip] = useState<WorldMapTooltipState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    renderWorldMap(canvas, mapData, entities, activeLayerId, mode, identity ?? null);
  }, [activeLayerId, entities, identity, mapData, mode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setTooltip(null), 0);
    return () => window.clearTimeout(timeout);
  }, [activeLayerId, identity, mapData, mode]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "styled") {
      setTooltip(null);
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const canvasX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * canvas.width;
    const canvasY = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * canvas.height;
    const hit = hitTestWorldMapAnnotation(mapData, activeLayerId, identity ?? null, canvasX, canvasY);
    setTooltip(hit
      ? {
          ...hit,
          leftPercent: (hit.screenX / Math.max(1, canvas.width)) * 100,
          topPercent: (hit.screenY / Math.max(1, canvas.height)) * 100,
        }
      : null);
  }, [activeLayerId, identity, mapData, mode]);

  const label = mode === "debug" ? "디버그 타일 지도" : "살아 있는 세계 지도";
  const className = mode === "debug" ? "world-canvas debug-world-canvas pixelated" : "world-canvas styled-world-canvas";
  const tooltipStyle = tooltip
    ? {
        left: `${tooltip.leftPercent}%`,
        top: `${tooltip.topPercent}%`,
      }
    : undefined;

  return (
    <div className="world-canvas-shell">
      <canvas
        ref={canvasRef}
        className={className}
        aria-label={label}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setTooltip(null)}
      />
      {tooltip ? (
        <div className="world-map-tooltip" style={tooltipStyle} role="tooltip">
          <strong>{tooltip.label}</strong>
          <span>{tooltip.detail}</span>
        </div>
      ) : null}
    </div>
  );
}
