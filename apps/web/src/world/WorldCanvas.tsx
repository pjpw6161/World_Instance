import { useEffect, useRef } from "react";
import type { MapData, TerrainType } from "@world-forge/shared";
import type { WorldEntity } from "./worldState";

interface WorldCanvasProps {
  mapData: MapData;
  entities: readonly WorldEntity[];
  activeLayerId: string;
}

const terrainColors: Record<TerrainType, string> = {
  "deep-water": "#1b4876",
  water: "#3174a8",
  sand: "#d5be80",
  grass: "#6b9654",
  forest: "#32663f",
  mountain: "#7c796f",
  road: "#967c52",
  "cave-floor": "#564c42",
  "cave-wall": "#2a2522",
};

export function WorldCanvas({ mapData, entities, activeLayerId }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    drawWorld(canvas, mapData, entities, activeLayerId);
  }, [activeLayerId, entities, mapData]);

  return <canvas ref={canvasRef} className="world-canvas pixelated" aria-label="World instance map" />;
}

function drawWorld(canvas: HTMLCanvasElement, mapData: MapData, entities: readonly WorldEntity[], activeLayerId: string): void {
  canvas.width = mapData.width;
  canvas.height = mapData.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }
  context.imageSmoothingEnabled = false;

  for (let index = 0; index < mapData.terrainMap.length; index += 1) {
    const x = index % mapData.width;
    const y = Math.floor(index / mapData.width);
    context.fillStyle = terrainColors[mapData.terrainMap[index]];
    context.fillRect(x, y, 1, 1);
  }

  for (const portal of mapData.portalList) {
    if (portal.fromLayerId !== activeLayerId) {
      continue;
    }
    context.fillStyle = portal.toLayerId === "cave" ? "#b96df2" : "#66c8ff";
    context.beginPath();
    context.moveTo(portal.x + 0.5, portal.y - 1.5);
    context.lineTo(portal.x + 2.5, portal.y + 0.5);
    context.lineTo(portal.x + 0.5, portal.y + 2.5);
    context.lineTo(portal.x - 1.5, portal.y + 0.5);
    context.closePath();
    context.fill();
    context.strokeStyle = "#1f2b27";
    context.lineWidth = 0.45;
    context.stroke();
  }

  for (const entity of entities) {
    if (entity.layerId !== activeLayerId) {
      continue;
    }
    context.fillStyle = entity.entityType === "player" ? "#f8f0a8" : "#c44d58";
    context.beginPath();
    context.arc(entity.x + 0.5, entity.y + 0.5, entity.entityType === "player" ? 2.4 : 1.8, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = entity.entityType === "player" ? "#26322d" : "#fff4ed";
    context.lineWidth = 0.45;
    context.stroke();
  }
}
