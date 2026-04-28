import type { MapData, TerrainType } from "@world-forge/shared";
import { canMoveBetween, type WorldEntity } from "./worldState";

export type Terrain3DViewMode = "orbit" | "top" | "side";

export interface TerrainMeshOptions {
  maxSamples?: number;
  terrainWidth?: number;
  heightScale?: number;
  layerId?: string;
}

export interface TerrainMeshData {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  columns: number;
  rows: number;
  terrainWidth: number;
  terrainDepth: number;
  heightScale: number;
  layerId: string;
}

export interface TerrainPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface HeightDiffMovementReadiness {
  tileHeight: number;
  jumpHeight: number;
  maxSlope: number;
  checkedDirections: number;
  reachableDirections: number;
  maxAdjacentHeightDiff: number;
}

const defaultMaxSamples = 96;
const defaultTerrainWidth = 72;
const defaultHeightScale = 12;
const movementDirections = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const terrainPalette: Record<TerrainType, [number, number, number]> = {
  "deep-water": [0.1, 0.24, 0.4],
  water: [0.16, 0.44, 0.66],
  sand: [0.8, 0.68, 0.42],
  grass: [0.34, 0.58, 0.31],
  forest: [0.16, 0.38, 0.23],
  mountain: [0.48, 0.47, 0.43],
  road: [0.55, 0.44, 0.29],
  "cave-floor": [0.32, 0.29, 0.25],
  "cave-wall": [0.16, 0.14, 0.13],
};

export interface TerrainLayerSceneStyle {
  backgroundColor: number;
  fogColor: number;
  ambientSkyColor: number;
  ambientGroundColor: number;
  ambientIntensity: number;
  keyLightColor: number;
  keyLightIntensity: number;
}

export function terrainLayerSceneStyle(layerId: string): TerrainLayerSceneStyle {
  if (isCaveLayer(layerId)) {
    return {
      backgroundColor: 0x171513,
      fogColor: 0x171513,
      ambientSkyColor: 0x4b4038,
      ambientGroundColor: 0x17110f,
      ambientIntensity: 1.7,
      keyLightColor: 0xf3d9aa,
      keyLightIntensity: 1.45,
    };
  }

  return {
    backgroundColor: 0xe6ede8,
    fogColor: 0xe6ede8,
    ambientSkyColor: 0xffffff,
    ambientGroundColor: 0x4f5c55,
    ambientIntensity: 2.2,
    keyLightColor: 0xffffff,
    keyLightIntensity: 1.8,
  };
}

export function createTerrainMeshData(mapData: MapData, options: TerrainMeshOptions = {}): TerrainMeshData {
  const xSamples = createSampleAxis(mapData.width, options.maxSamples ?? defaultMaxSamples);
  const ySamples = createSampleAxis(mapData.height, options.maxSamples ?? defaultMaxSamples);
  const columns = xSamples.length;
  const rows = ySamples.length;
  const vertexCount = columns * rows;
  const terrainWidth = options.terrainWidth ?? defaultTerrainWidth;
  const terrainDepth = terrainWidth * (mapData.height / Math.max(1, mapData.width));
  const heightScale = options.heightScale ?? defaultHeightScale;
  const layerId = options.layerId ?? "surface";
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(Math.max(0, (columns - 1) * (rows - 1) * 6));

  let vertexOffset = 0;
  for (let row = 0; row < rows; row += 1) {
    const tileY = ySamples[row];
    for (let column = 0; column < columns; column += 1) {
      const tileX = xSamples[column];
      const tileIndex = tileY * mapData.width + tileX;
      const positionIndex = vertexOffset * 3;
      positions[positionIndex] = tileToWorldX(tileX, mapData.width, terrainWidth);
      positions[positionIndex + 1] = normalizedHeight(mapData.heightMap[tileIndex]) * heightScale;
      positions[positionIndex + 2] = tileToWorldZ(tileY, mapData.height, terrainDepth);

      const color = terrainColorForLayer(mapData.terrainMap[tileIndex], layerId);
      colors[positionIndex] = color[0];
      colors[positionIndex + 1] = color[1];
      colors[positionIndex + 2] = color[2];
      vertexOffset += 1;
    }
  }

  let indexOffset = 0;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const topLeft = row * columns + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns;
      const bottomRight = bottomLeft + 1;
      indices[indexOffset] = topLeft;
      indices[indexOffset + 1] = bottomLeft;
      indices[indexOffset + 2] = topRight;
      indices[indexOffset + 3] = topRight;
      indices[indexOffset + 4] = bottomLeft;
      indices[indexOffset + 5] = bottomRight;
      indexOffset += 6;
    }
  }

  return {
    positions,
    colors,
    indices,
    columns,
    rows,
    terrainWidth,
    terrainDepth,
    heightScale,
    layerId,
  };
}

export function entityToTerrainPosition(
  mapData: MapData,
  entity: WorldEntity,
  meshData: TerrainMeshData,
  lift = 0.7,
): TerrainPoint3D {
  return tileToTerrainPosition(mapData, entity.x, entity.y, meshData, lift);
}

export function tileToTerrainPosition(
  mapData: MapData,
  x: number,
  y: number,
  meshData: TerrainMeshData,
  lift = 0,
): TerrainPoint3D {
  const tileX = clampInteger(x, 0, mapData.width - 1);
  const tileY = clampInteger(y, 0, mapData.height - 1);
  const height = mapData.heightMap[tileY * mapData.width + tileX];

  return {
    x: tileToWorldX(tileX, mapData.width, meshData.terrainWidth),
    y: normalizedHeight(height) * meshData.heightScale + lift,
    z: tileToWorldZ(tileY, mapData.height, meshData.terrainDepth),
  };
}

export function heightDiffMovementReadiness(mapData: MapData, entity: WorldEntity): HeightDiffMovementReadiness {
  const tileX = clampInteger(entity.x, 0, mapData.width - 1);
  const tileY = clampInteger(entity.y, 0, mapData.height - 1);
  const tileHeight = normalizedHeight(mapData.heightMap[tileY * mapData.width + tileX]);
  const jumpHeight = Math.max(0, entity.jumpHeight);
  const maxSlope = Math.max(0, entity.maxSlope);
  const movementEntity = {
    ...entity,
    x: tileX,
    y: tileY,
    jumpHeight,
    maxSlope,
  };
  let checkedDirections = 0;
  let reachableDirections = 0;
  let maxAdjacentHeightDiff = 0;

  for (const [dx, dy] of movementDirections) {
    const nextX = tileX + dx;
    const nextY = tileY + dy;
    if (!isInsideMap(mapData, nextX, nextY)) {
      continue;
    }
    checkedDirections += 1;
    const nextHeight = normalizedHeight(mapData.heightMap[nextY * mapData.width + nextX]);
    const heightDiff = Math.abs(nextHeight - tileHeight);
    maxAdjacentHeightDiff = Math.max(maxAdjacentHeightDiff, heightDiff);
    if (canMoveBetween(mapData, movementEntity, tileX, tileY, nextX, nextY)) {
      reachableDirections += 1;
    }
  }

  return {
    tileHeight,
    jumpHeight,
    maxSlope,
    checkedDirections,
    reachableDirections,
    maxAdjacentHeightDiff,
  };
}

function createSampleAxis(size: number, maxSamples: number): number[] {
  const clampedSize = Math.max(1, Math.trunc(size));
  const clampedMaxSamples = Math.max(1, Math.trunc(maxSamples));
  if (clampedSize === 1) {
    return [0];
  }

  const step = Math.max(1, Math.ceil((clampedSize - 1) / Math.max(1, clampedMaxSamples - 1)));
  const samples: number[] = [];
  for (let value = 0; value < clampedSize; value += step) {
    samples.push(value);
  }
  if (samples[samples.length - 1] !== clampedSize - 1) {
    samples.push(clampedSize - 1);
  }
  return samples;
}

function tileToWorldX(tileX: number, width: number, terrainWidth: number): number {
  if (width <= 1) {
    return 0;
  }
  return (tileX / (width - 1) - 0.5) * terrainWidth;
}

function tileToWorldZ(tileY: number, height: number, terrainDepth: number): number {
  if (height <= 1) {
    return 0;
  }
  return (tileY / (height - 1) - 0.5) * terrainDepth;
}

function isInsideMap(mapData: MapData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mapData.width && y < mapData.height;
}

function normalizedHeight(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value ?? 0));
}

function terrainColorForLayer(terrain: TerrainType | undefined, layerId: string): [number, number, number] {
  const baseColor = terrainPalette[terrain ?? "grass"] ?? terrainPalette.grass;
  if (!isCaveLayer(layerId)) {
    return baseColor;
  }
  if (terrain === "cave-floor" || terrain === "cave-wall") {
    return baseColor;
  }
  const caveTint: [number, number, number] = [0.25, 0.22, 0.19];
  return [
    roundColor(baseColor[0] * 0.42 + caveTint[0] * 0.58),
    roundColor(baseColor[1] * 0.42 + caveTint[1] * 0.58),
    roundColor(baseColor[2] * 0.42 + caveTint[2] * 0.58),
  ];
}

function isCaveLayer(layerId: string): boolean {
  return layerId.toLowerCase().includes("cave");
}

function roundColor(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
