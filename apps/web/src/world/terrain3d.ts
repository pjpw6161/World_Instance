import type { MapData, TerrainType } from "@world-forge/shared";
import { canMoveBetween, type WorldEntity } from "./worldState";

export type Terrain3DViewMode = "orbit" | "top";

export interface TerrainMeshOptions {
  maxSamples?: number;
  terrainWidth?: number;
  heightScale?: number;
  layerId?: string;
  smoothingPasses?: number;
  terraceSteps?: number;
}

export interface TerrainMeshData {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  visualHeightMap: Float32Array;
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
const defaultHeightScale = 6.2;
const defaultSmoothingPasses = 3;
const defaultTerraceSteps = 8;
const movementDirections = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const terrainPalette: Record<TerrainType, [number, number, number]> = {
  "deep-water": [0.09, 0.3, 0.5],
  water: [0.22, 0.55, 0.72],
  sand: [0.86, 0.73, 0.44],
  grass: [0.42, 0.68, 0.34],
  forest: [0.18, 0.43, 0.25],
  mountain: [0.57, 0.56, 0.5],
  road: [0.62, 0.49, 0.31],
  "cave-floor": [0.35, 0.31, 0.25],
  "cave-wall": [0.2, 0.17, 0.15],
};

interface VisualPlateauAnchor {
  x: number;
  y: number;
  radius: number;
  targetHeight: number;
  strength: number;
}

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
      backgroundColor: 0x1b1714,
      fogColor: 0x1b1714,
      ambientSkyColor: 0x665446,
      ambientGroundColor: 0x18110f,
      ambientIntensity: 1.55,
      keyLightColor: 0xf3d9aa,
      keyLightIntensity: 1.35,
    };
  }

  return {
    backgroundColor: 0xf2ead7,
    fogColor: 0xf2ead7,
    ambientSkyColor: 0xfff3d6,
    ambientGroundColor: 0x557060,
    ambientIntensity: 1.85,
    keyLightColor: 0xffdfad,
    keyLightIntensity: 1.55,
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
  const visualHeightMap = createVisualHeightMap(mapData, options);
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
      positions[positionIndex + 1] = visualHeightMap[tileIndex] * heightScale;
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
    visualHeightMap,
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
  const tileIndex = tileY * mapData.width + tileX;
  const height = meshData.visualHeightMap[tileIndex] ?? normalizedHeight(mapData.heightMap[tileIndex]);

  return {
    x: tileToWorldX(tileX, mapData.width, meshData.terrainWidth),
    y: height * meshData.heightScale + lift,
    z: tileToWorldZ(tileY, mapData.height, meshData.terrainDepth),
  };
}

export function createVisualHeightMap(mapData: MapData, options: TerrainMeshOptions = {}): Float32Array {
  const totalTiles = Math.max(0, mapData.width * mapData.height);
  let heights: Float32Array = new Float32Array(totalTiles);
  for (let index = 0; index < totalTiles; index += 1) {
    heights[index] = normalizedHeight(mapData.heightMap[index]);
  }

  const smoothingPasses = Math.max(0, Math.trunc(options.smoothingPasses ?? defaultSmoothingPasses));
  for (let pass = 0; pass < smoothingPasses; pass += 1) {
    heights = smoothHeightMap(mapData, heights);
  }
  heights = limitVisualSlope(mapData, heights, visualSlopeLimit(mapData), 2);

  const terraceSteps = Math.max(2, Math.trunc(options.terraceSteps ?? defaultTerraceSteps));
  let visualHeights: Float32Array = new Float32Array(totalTiles);
  for (let index = 0; index < totalTiles; index += 1) {
    const terrain = mapData.terrainMap[index] ?? "grass";
    const shapedHeight = terrainVisualHeight(mapData, terrain, heights[index]);
    const terracedHeight = Math.round(shapedHeight * terraceSteps) / terraceSteps;
    visualHeights[index] = clamp01(terracedHeight * 0.62 + shapedHeight * 0.38);
  }
  visualHeights = applyVisualPlateaus(mapData, visualHeights, createVisualPlateauAnchors(mapData));
  visualHeights = smoothHeightMap(mapData, visualHeights);
  visualHeights = limitVisualSlope(mapData, visualHeights, visualSlopeLimit(mapData) * 0.72, 3);
  return visualHeights;
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
  return clamp01(value ?? 0);
}

function smoothHeightMap(mapData: MapData, source: Float32Array): Float32Array {
  const smoothed = new Float32Array(source.length);
  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      const tileIndex = y * mapData.width + x;
      let weightedHeight = source[tileIndex] * 0.52;
      let totalWeight = 0.52;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nextX = x + dx;
          const nextY = y + dy;
          if (!isInsideMap(mapData, nextX, nextY)) {
            continue;
          }
          const neighborWeight = Math.abs(dx) + Math.abs(dy) === 1 ? 0.1 : 0.02;
          weightedHeight += source[nextY * mapData.width + nextX] * neighborWeight;
          totalWeight += neighborWeight;
        }
      }

      smoothed[tileIndex] = weightedHeight / totalWeight;
    }
  }
  return smoothed;
}

function terrainVisualHeight(mapData: MapData, terrain: TerrainType, smoothedHeight: number): number {
  const waterRatio = clamp01(mapData.stats.waterRatio ?? 0);
  const mountainRatio = clamp01(mapData.stats.mountainRatio ?? 0);
  const lowlandCompression = clamp01(waterRatio * 0.24 + Math.max(0, 0.12 - mountainRatio) * 1.6);
  const compressedHeight = Math.pow(clamp01(smoothedHeight), 0.9) * (0.62 + mountainRatio * 0.34 - lowlandCompression * 0.2);
  if (terrain === "deep-water") {
    return clamp01(0.012 + compressedHeight * 0.035);
  }
  if (terrain === "water") {
    return clamp01(0.028 + compressedHeight * 0.05);
  }
  if (terrain === "sand") {
    return clamp01(0.07 + compressedHeight * 0.08);
  }
  if (terrain === "road") {
    return clamp01(0.105 + compressedHeight * 0.2);
  }
  if (terrain === "forest") {
    return clamp01(0.14 + compressedHeight * (0.3 + mountainRatio * 0.08));
  }
  if (terrain === "mountain") {
    const mountainBoost = 0.2 + mountainRatio * 0.38;
    return clamp01(0.24 + Math.pow(clamp01(smoothedHeight), 0.82) * mountainBoost);
  }
  if (terrain === "cave-floor") {
    return clamp01(0.08 + compressedHeight * 0.14);
  }
  if (terrain === "cave-wall") {
    return clamp01(0.24 + compressedHeight * 0.24);
  }
  return clamp01(0.12 + compressedHeight * 0.26);
}

function createVisualPlateauAnchors(mapData: MapData): VisualPlateauAnchor[] {
  const anchors: VisualPlateauAnchor[] = [];
  const coreTile = findNearestVisualWalkableTile(mapData, Math.floor(mapData.width / 2), Math.floor(mapData.height / 2));
  const baseRadius = Math.max(3, Math.round(Math.min(mapData.width, mapData.height) * 0.055));
  anchors.push({
    x: coreTile.x,
    y: coreTile.y,
    radius: baseRadius,
    targetHeight: visualTargetHeightForTile(mapData, coreTile.x, coreTile.y),
    strength: 0.86,
  });

  for (const portal of mapData.portalList.filter((portal) => portal.fromLayerId === "surface").slice(0, 3)) {
    anchors.push({
      x: portal.x,
      y: portal.y,
      radius: Math.max(3, Math.round(baseRadius * 0.82)),
      targetHeight: visualTargetHeightForTile(mapData, portal.x, portal.y),
      strength: 0.78,
    });
  }

  for (const object of mapData.objectList.filter((object) => object.layerId === "surface" && object.type !== "tree").slice(0, 4)) {
    anchors.push({
      x: object.x,
      y: object.y,
      radius: object.type === "village" ? Math.max(4, baseRadius) : Math.max(3, Math.round(baseRadius * 0.7)),
      targetHeight: visualTargetHeightForTile(mapData, object.x, object.y),
      strength: object.type === "rock" ? 0.46 : 0.72,
    });
  }

  return anchors;
}

function applyVisualPlateaus(
  mapData: MapData,
  source: Float32Array,
  anchors: readonly VisualPlateauAnchor[],
): Float32Array {
  if (anchors.length === 0) {
    return source;
  }
  const result = new Float32Array(source);
  for (const anchor of anchors) {
    const radius = Math.max(1, anchor.radius);
    const minX = Math.max(0, Math.floor(anchor.x - radius));
    const maxX = Math.min(mapData.width - 1, Math.ceil(anchor.x + radius));
    const minY = Math.max(0, Math.floor(anchor.y - radius));
    const maxY = Math.min(mapData.height - 1, Math.ceil(anchor.y + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - anchor.x, y - anchor.y);
        if (distance > radius) {
          continue;
        }
        const terrain = mapData.terrainMap[y * mapData.width + x];
        const terrainPenalty = terrain === "deep-water" || terrain === "water" || terrain === "cave-wall" ? 0.42 : 1;
        const falloff = 1 - distance / radius;
        const weight = falloff * falloff * anchor.strength * terrainPenalty;
        const tileIndex = y * mapData.width + x;
        result[tileIndex] = clamp01(result[tileIndex] * (1 - weight) + anchor.targetHeight * weight);
      }
    }
  }
  return result;
}

function limitVisualSlope(mapData: MapData, source: Float32Array, maxDiff: number, iterations: number): Float32Array {
  let result = new Float32Array(source);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Float32Array(result);
    for (let y = 0; y < mapData.height; y += 1) {
      for (let x = 0; x < mapData.width; x += 1) {
        const tileIndex = y * mapData.width + x;
        const current = result[tileIndex];
        if (x + 1 < mapData.width) {
          constrainSlopePair(next, result, tileIndex, tileIndex + 1, maxDiff);
        }
        if (y + 1 < mapData.height) {
          constrainSlopePair(next, result, tileIndex, tileIndex + mapData.width, maxDiff);
        }
        next[tileIndex] = Math.min(next[tileIndex], current + maxDiff);
      }
    }
    result = next;
  }
  return result;
}

function constrainSlopePair(next: Float32Array, source: Float32Array, leftIndex: number, rightIndex: number, maxDiff: number): void {
  const left = source[leftIndex];
  const right = source[rightIndex];
  if (left - right > maxDiff) {
    next[leftIndex] = Math.min(next[leftIndex], right + maxDiff);
  } else if (right - left > maxDiff) {
    next[rightIndex] = Math.min(next[rightIndex], left + maxDiff);
  }
}

function visualSlopeLimit(mapData: MapData): number {
  const mountainRatio = clamp01(mapData.stats.mountainRatio ?? 0);
  const waterRatio = clamp01(mapData.stats.waterRatio ?? 0);
  return clampNumber(0.065 + mountainRatio * 0.15 - waterRatio * 0.035, 0.045, 0.16);
}

function visualTargetHeightForTile(mapData: MapData, x: number, y: number): number {
  const tileIndex = y * mapData.width + x;
  const terrain = mapData.terrainMap[tileIndex] ?? "grass";
  return terrainVisualHeight(mapData, terrain, normalizedHeight(mapData.heightMap[tileIndex])) * 0.58 + 0.12;
}

function findNearestVisualWalkableTile(mapData: MapData, preferredX: number, preferredY: number): { x: number; y: number } {
  const startX = clampInteger(preferredX, 0, mapData.width - 1);
  const startY = clampInteger(preferredY, 0, mapData.height - 1);
  if (isVisualWalkable(mapData, startX, startY)) {
    return { x: startX, y: startY };
  }
  const maxRadius = Math.max(mapData.width, mapData.height);
  for (let radius = 1; radius < maxRadius; radius += 1) {
    for (let y = startY - radius; y <= startY + radius; y += 1) {
      for (let x = startX - radius; x <= startX + radius; x += 1) {
        if ((Math.abs(x - startX) !== radius && Math.abs(y - startY) !== radius) || !isVisualWalkable(mapData, x, y)) {
          continue;
        }
        return { x, y };
      }
    }
  }
  return { x: startX, y: startY };
}

function isVisualWalkable(mapData: MapData, x: number, y: number): boolean {
  if (!isInsideMap(mapData, x, y)) {
    return false;
  }
  const tileIndex = y * mapData.width + x;
  const terrain = mapData.terrainMap[tileIndex];
  return mapData.collisionMap[tileIndex] !== true && terrain !== "deep-water" && terrain !== "water" && terrain !== "cave-wall";
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
  return clamp01(Math.round(value * 1000) / 1000);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
