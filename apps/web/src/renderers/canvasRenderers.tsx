import { useEffect, useRef } from "react";
import type { MapData, TerrainType } from "@world-forge/shared";

interface MapRendererProps {
  mapData: MapData;
}

const terrainColors: Record<TerrainType, readonly [number, number, number]> = {
  "deep-water": [27, 72, 118],
  water: [49, 116, 168],
  sand: [213, 190, 128],
  grass: [107, 150, 84],
  forest: [50, 102, 63],
  mountain: [124, 121, 111],
  road: [150, 124, 82],
  "cave-floor": [86, 76, 66],
  "cave-wall": [42, 37, 34],
};

export function TerrainMapView({ mapData }: MapRendererProps) {
  const canvasRef = useCanvasRenderer(mapData, drawTerrainMap);
  return <canvas ref={canvasRef} className="map-canvas pixelated" aria-label="2D terrain view" />;
}

export function HeightMapView({ mapData }: MapRendererProps) {
  const canvasRef = useCanvasRenderer(mapData, drawHeightMap);
  return <canvas ref={canvasRef} className="map-canvas pixelated" aria-label="Height map view" />;
}

export function SideMapView({ mapData }: MapRendererProps) {
  const canvasRef = useCanvasRenderer(mapData, drawSideView);
  return <canvas ref={canvasRef} className="map-canvas side-canvas" aria-label="Side view" />;
}

function useCanvasRenderer(
  mapData: MapData,
  draw: (canvas: HTMLCanvasElement, mapData: MapData) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    draw(canvas, mapData);
  }, [draw, mapData]);

  return canvasRef;
}

function drawTerrainMap(canvas: HTMLCanvasElement, mapData: MapData): void {
  const context = prepareTileCanvas(canvas, mapData.width, mapData.height);
  const image = context.createImageData(mapData.width, mapData.height);

  for (let index = 0; index < mapData.terrainMap.length; index += 1) {
    const color = terrainColors[mapData.terrainMap[index]];
    const offset = index * 4;
    image.data[offset] = color[0];
    image.data[offset + 1] = color[1];
    image.data[offset + 2] = color[2];
    image.data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);
}

function drawHeightMap(canvas: HTMLCanvasElement, mapData: MapData): void {
  const context = prepareTileCanvas(canvas, mapData.width, mapData.height);
  const image = context.createImageData(mapData.width, mapData.height);

  for (let index = 0; index < mapData.heightMap.length; index += 1) {
    const value = Math.round(clamp01(mapData.heightMap[index]) * 255);
    const offset = index * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);
}

function drawSideView(canvas: HTMLCanvasElement, mapData: MapData): void {
  const canvasHeight = 180;
  const context = prepareTileCanvas(canvas, mapData.width, canvasHeight);
  const row = Math.floor(mapData.height / 2);

  context.fillStyle = "#edf2f0";
  context.fillRect(0, 0, mapData.width, canvasHeight);
  context.fillStyle = "#1f2b27";

  context.beginPath();
  context.moveTo(0, canvasHeight);
  for (let x = 0; x < mapData.width; x += 1) {
    const height = clamp01(mapData.heightMap[row * mapData.width + x]);
    const y = canvasHeight - Math.round(height * (canvasHeight - 12));
    context.lineTo(x, y);
  }
  context.lineTo(mapData.width, canvasHeight);
  context.closePath();
  context.fill();

  context.strokeStyle = "#6a8d73";
  context.lineWidth = 2;
  context.beginPath();
  for (let x = 0; x < mapData.width; x += 1) {
    const height = clamp01(mapData.heightMap[row * mapData.width + x]);
    const y = canvasHeight - Math.round(height * (canvasHeight - 12));
    if (x === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();
}

function prepareTileCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }
  context.imageSmoothingEnabled = false;
  return context;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
