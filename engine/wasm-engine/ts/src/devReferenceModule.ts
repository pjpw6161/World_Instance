import type { GenerationRecipe, MapObject, Portal, TerrainType } from "@world-forge/shared";
import type { WorldForgeLowLevelModule } from "./types";

const FNV_OFFSET = 14695981039346656037n;
const FNV_PRIME = 1099511628211n;
const MASK_64 = 0xffffffffffffffffn;

interface TileData {
  height: number;
  terrain: TerrainType;
  blocked: boolean;
  cost: number;
}

interface CavePlan {
  entrances: { x: number; y: number }[];
  caveTiles: { x: number; y: number }[];
  wallTiles: { x: number; y: number }[];
  areaRatio: number;
}

interface ObjectCandidate {
  x: number;
  y: number;
  score: number;
}

// Temporary test/dev fallback until an Emscripten artifact is available.
// Production frontend code should use createWorldForgeWasmEngine() with the real WASM module.
export function createDeterministicDevModule(): WorldForgeLowLevelModule {
  return {
    engine_version: () => "0.1.0",
    generate_map_json: (
      engineVersion,
      seed,
      width,
      height,
      featureMountains,
      featureForests,
      featureTrees,
      featureRoads,
      featureCaves,
      featureRivers,
      featureVillages,
      terrainAlgorithm,
      caveAlgorithm,
      roadAlgorithm,
      objectPlacementAlgorithm,
      waterLevel,
      mountainLevel,
      forestDensity,
      caveDensity,
      roadComplexity,
    ) => {
      const recipe: GenerationRecipe = {
        engineVersion,
        seed,
        width,
        height,
        features: {
          mountains: featureMountains,
          forests: featureForests,
          trees: featureTrees,
          roads: featureRoads,
          caves: featureCaves,
          rivers: featureRivers,
          villages: featureVillages,
        },
        algorithms: {
          terrain: terrainAlgorithm as GenerationRecipe["algorithms"]["terrain"],
          cave: caveAlgorithm as GenerationRecipe["algorithms"]["cave"],
          road: roadAlgorithm as GenerationRecipe["algorithms"]["road"],
          objectPlacement: objectPlacementAlgorithm as GenerationRecipe["algorithms"]["objectPlacement"],
        },
        params: {
          waterLevel: clamp01(waterLevel),
          mountainLevel: clamp01(mountainLevel),
          forestDensity: clamp01(forestDensity),
          caveDensity: clamp01(caveDensity),
          roadComplexity: clamp01(roadComplexity),
        },
      };
      return generateReferenceMapJson(recipe);
    },
  };
}

function generateReferenceMapJson(recipe: GenerationRecipe): string {
  const recipeKey = buildRecipeKey(recipe);
  const seedKey = fnv1a(recipeKey);
  let heightMap = createPlayableHeightMap(recipe, seedKey);
  const tiles: TileData[] = [];

  let waterCount = 0;
  let landCount = 0;
  let forestCount = 0;
  let mountainCount = 0;
  let blockedCount = 0;
  let roadLength = 0;

  for (let y = 0; y < recipe.height; y += 1) {
    for (let x = 0; x < recipe.width; x += 1) {
      const index = y * recipe.width + x;
      const height = heightMap[index];
      const forestNoise = unitNoise(seedKey, x, y, 0x27d4eb2fn);
      const terrain = classifyTerrain(height, forestNoise, recipe);
      const blocked = isBlocked(terrain);
      const cost = movementCost(terrain);
      tiles.push({ height, terrain, blocked, cost });
    }
  }

  const cavePlan = createCavePlan(tiles, recipe, seedKey);
  applyCavePlanToTiles(tiles, recipe.width, recipe.height, cavePlan);
  applyRoadTrails(tiles, recipe, seedKey, cavePlan.entrances);
  if (cavePlan.entrances.length > 0) {
    heightMap = applyPlayableClearing(heightMap, recipe.width, recipe.height, cavePlan.entrances, recipe);
    for (let index = 0; index < tiles.length; index += 1) {
      tiles[index].height = heightMap[index];
    }
  }
  const objectList = placeObjects(tiles, recipe, cavePlan.entrances, seedKey);
  const portalList = cavePortals(cavePlan.entrances);

  let hashInput = `${recipeKey}|`;
  for (const tile of tiles) {
    hashInput += `${Math.trunc(tile.height * 10000)}:${tile.terrain}:${tile.blocked ? 1 : 0}:${tile.cost};`;

    if (tile.terrain === "deep-water" || tile.terrain === "water") {
      waterCount += 1;
    } else {
      landCount += 1;
    }
    if (tile.terrain === "forest") {
      forestCount += 1;
    }
    if (tile.terrain === "mountain") {
      mountainCount += 1;
    }
    if (tile.terrain === "road") {
      roadLength += 1;
    }
    if (tile.blocked) {
      blockedCount += 1;
    }
  }
  hashInput += "objects|";
  let treeCount = 0;
  let villageCount = 0;
  for (const object of objectList) {
    hashInput += `${object.type}:${object.layerId}:${object.x}:${object.y};`;
    if (object.type === "tree") {
      treeCount += 1;
    }
    if (object.type === "village") {
      villageCount += 1;
    }
  }
  hashInput += "portals|";
  cavePlan.entrances.forEach((entrance, index) => {
    hashInput += `${index}:${entrance.x}:${entrance.y};`;
  });

  const tileCount = Math.max(1, recipe.width * recipe.height);
  return JSON.stringify({
    width: recipe.width,
    height: recipe.height,
    heightMap: tiles.map((tile) => tile.height),
    terrainMap: tiles.map((tile) => tile.terrain),
    objectList,
    collisionMap: tiles.map((tile) => tile.blocked),
    costMap: tiles.map((tile) => tile.cost),
    portalList,
    stats: {
      waterRatio: round4(waterCount / tileCount),
      landRatio: round4(landCount / tileCount),
      forestRatio: round4(forestCount / tileCount),
      mountainRatio: round4(mountainCount / tileCount),
      treeCount,
      roadLength,
      caveAreaRatio: round4(cavePlan.areaRatio),
      villageCount,
      blockedRatio: round4(blockedCount / tileCount),
      generationTimeMs: 0,
    },
    mapHash: hashHex(fnv1a(hashInput)),
  });
}

function cavePortals(entrances: readonly { x: number; y: number }[]): Portal[] {
  return entrances.flatMap((portal, index) => [
    {
      id: `surface-cave-entrance-${index}`,
      fromLayerId: "surface",
      toLayerId: "cave",
      x: portal.x,
      y: portal.y,
      targetX: portal.x,
      targetY: portal.y,
    },
    {
      id: `cave-surface-exit-${index}`,
      fromLayerId: "cave",
      toLayerId: "surface",
      x: portal.x,
      y: portal.y,
      targetX: portal.x,
      targetY: portal.y,
    },
  ]);
}

function findWalkableTile(
  tiles: readonly TileData[],
  width: number,
  height: number,
  preferredX: number,
  preferredY: number,
): { x: number; y: number } | null {
  const startX = clampInteger(preferredX, 0, width - 1);
  const startY = clampInteger(preferredY, 0, height - 1);
  if (isWalkableAt(tiles, width, height, startX, startY)) {
    return { x: startX, y: startY };
  }

  const maxRadius = Math.max(width, height);
  for (let radius = 1; radius < maxRadius; radius += 1) {
    for (let y = startY - radius; y <= startY + radius; y += 1) {
      for (let x = startX - radius; x <= startX + radius; x += 1) {
        if (Math.abs(x - startX) !== radius && Math.abs(y - startY) !== radius) {
          continue;
        }
        if (isWalkableAt(tiles, width, height, x, y)) {
          return { x, y };
        }
      }
    }
  }

  return null;
}

function isWalkableAt(tiles: readonly TileData[], width: number, height: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }
  return tiles[y * width + x]?.blocked === false;
}

function pointInBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function pushUniquePoint(points: { x: number; y: number }[], point: { x: number; y: number }): void {
  if (!points.some((current) => current.x === point.x && current.y === point.y)) {
    points.push(point);
  }
}

function containsPoint(points: readonly { x: number; y: number }[], point: { x: number; y: number }): boolean {
  return points.some((current) => current.x === point.x && current.y === point.y);
}

function applyCavePlanToTiles(tiles: TileData[], width: number, height: number, plan: CavePlan): void {
  for (const point of plan.wallTiles) {
    if (!pointInBounds(width, height, point.x, point.y) || containsPoint(plan.caveTiles, point)) {
      continue;
    }
    const tile = tiles[point.y * width + point.x];
    if (!tile || tile.terrain === "deep-water" || tile.terrain === "water") {
      continue;
    }
    tile.terrain = "cave-wall";
    tile.blocked = true;
    tile.cost = movementCost(tile.terrain);
  }

  for (const point of plan.caveTiles) {
    if (!pointInBounds(width, height, point.x, point.y)) {
      continue;
    }
    const tile = tiles[point.y * width + point.x];
    if (!tile || tile.terrain === "deep-water" || tile.terrain === "water") {
      continue;
    }
    tile.terrain = "cave-floor";
    tile.blocked = false;
    tile.cost = movementCost(tile.terrain);
  }

  const boundaryOffsets = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (const point of plan.caveTiles) {
    for (const [dx, dy] of boundaryOffsets) {
      const boundary = { x: point.x + dx, y: point.y + dy };
      if (!pointInBounds(width, height, boundary.x, boundary.y) || containsPoint(plan.caveTiles, boundary)) {
        continue;
      }
      const tile = tiles[boundary.y * width + boundary.x];
      if (!tile || tile.terrain === "deep-water" || tile.terrain === "water" || tile.terrain === "road") {
        continue;
      }
      tile.terrain = "cave-wall";
      tile.blocked = true;
      tile.cost = movementCost(tile.terrain);
    }
  }

  for (const entrance of plan.entrances) {
    if (!pointInBounds(width, height, entrance.x, entrance.y)) {
      continue;
    }
    const tile = tiles[entrance.y * width + entrance.x];
    if (!tile) {
      continue;
    }
    tile.terrain = "cave-floor";
    tile.blocked = false;
    tile.cost = movementCost(tile.terrain);
  }
}

function createCavePlan(tiles: readonly TileData[], recipe: GenerationRecipe, seedKey: bigint): CavePlan {
  if (!recipe.features.caves || recipe.params.caveDensity <= 0.02) {
    return { entrances: [], caveTiles: [], wallTiles: [], areaRatio: 0 };
  }

  const maxEntrances = Math.max(1, Math.min(5, 1 + Math.round(recipe.params.caveDensity * 4)));
  const minDistance = Math.max(5, Math.floor(Math.min(recipe.width, recipe.height) / 6));
  const plan: CavePlan = { entrances: [], caveTiles: [], wallTiles: [], areaRatio: 0 };
  let caveScoreCount = 0;

  if (recipe.algorithms.cave === "random-walk") {
    const visited = new Set<string>();
    const walkerCount = Math.max(1, Math.min(maxEntrances, 1 + Math.round(recipe.params.caveDensity * 3)));
    const starts = caveSeedPoints(tiles, recipe, seedKey, walkerCount);
    const steps = Math.max(48, Math.round(Math.min(recipe.width, recipe.height) * (0.55 + recipe.params.caveDensity * 0.85)));
    const brushRadius = recipe.params.caveDensity >= 0.72 ? 2 : 1;

    for (const [walkerIndex, start] of starts.entries()) {
      let x = start.x;
      let y = start.y;
      let direction = Math.floor(unitNoise(seedKey, x, y, 0x99117dd3n + BigInt(walkerIndex)) * 4);
      for (let step = 0; step < steps; step += 1) {
        carveCaveBrush(plan, recipe.width, recipe.height, { x, y }, brushRadius);
        visited.add(`${x}:${y}`);
        const candidate = findWalkableTile(tiles, recipe.width, recipe.height, x, y);
        if (
          candidate
          && pointIsSpaced(plan.entrances, candidate, minDistance)
          && plan.entrances.length < maxEntrances
          && step % Math.max(8, Math.floor(steps / Math.max(1, maxEntrances))) === 0
        ) {
          plan.entrances.push(candidate);
        }

        const turn = unitNoise(seedKey, x + step * 7, y - step * 11, 0x99117dd3n + BigInt(walkerIndex * 97));
        if (turn < 0.22) {
          direction = (direction + 3) % 4;
        } else if (turn < 0.46) {
          direction = (direction + 1) % 4;
        } else if (turn > 0.94) {
          direction = (direction + 2) % 4;
        }
        const next = nextCaveWalkStep(tiles, recipe.width, recipe.height, x, y, direction);
        x = next.x;
        y = next.y;
        direction = next.direction;
      }
    }
    caveScoreCount = Math.max(visited.size, plan.caveTiles.length);
  } else {
    const centers = caveSeedPoints(tiles, recipe, seedKey, maxEntrances);
    const chamberRadius = Math.max(8, Math.round(Math.min(recipe.width, recipe.height) * (0.1 + recipe.params.caveDensity * 0.1)));
    const threshold = 0.86 - recipe.params.caveDensity * 0.14;
    const caveMask = new Array<boolean>(recipe.width * recipe.height).fill(false);
    let open = new Array<boolean>(recipe.width * recipe.height).fill(false);
    for (let y = 1; y < recipe.height - 1; y += 1) {
      for (let x = 1; x < recipe.width - 1; x += 1) {
        const tile = tiles[y * recipe.width + x];
        if (!tile || tile.blocked || tile.terrain === "deep-water" || tile.terrain === "water") {
          continue;
        }
        const influence = caveRegionInfluence(centers, x, y, chamberRadius);
        if (influence <= 0) {
          continue;
        }
        caveMask[y * recipe.width + x] = true;
        const rockyBias = tile.terrain === "mountain" || tile.terrain === "forest" ? 0.06 : 0;
        const score = unitNoise(seedKey, Math.trunc(x / 3), Math.trunc(y / 3), 0xca7e11a5n) + rockyBias;
        open[y * recipe.width + x] = score + influence * 0.38 > threshold;
      }
    }
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const next = [...open];
      for (let y = 1; y < recipe.height - 1; y += 1) {
        for (let x = 1; x < recipe.width - 1; x += 1) {
          const index = y * recipe.width + x;
          const tile = tiles[index];
          if (!tile || !caveMask[index] || tile.blocked || tile.terrain === "deep-water" || tile.terrain === "water") {
            next[index] = false;
            continue;
          }
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) {
                continue;
              }
              if (open[(y + dy) * recipe.width + (x + dx)]) {
                neighbors += 1;
              }
            }
          }
          next[index] = open[index] ? neighbors >= 3 : neighbors >= 5;
        }
      }
      open = next;
    }
    for (const center of centers) {
      carveCaveBrush(plan, recipe.width, recipe.height, center, Math.max(2, Math.round(chamberRadius * 0.08)));
    }
    for (let y = 1; y < recipe.height - 1; y += 1) {
      for (let x = 1; x < recipe.width - 1; x += 1) {
        if (!open[y * recipe.width + x]) {
          continue;
        }
        pushUniquePoint(plan.caveTiles, { x, y });
        caveScoreCount += 1;
        if (unitNoise(seedKey, x, y, 0xe17aace5n) > 0.82) {
          const candidate = findWalkableTile(tiles, recipe.width, recipe.height, x, y);
          if (candidate && pointIsSpaced(plan.entrances, candidate, minDistance) && plan.entrances.length < maxEntrances) {
            plan.entrances.push(candidate);
          }
        }
      }
    }
  }

  if (plan.entrances.length === 0) {
    const fallback = findWalkableTile(tiles, recipe.width, recipe.height, Math.floor(recipe.width / 2), Math.floor(recipe.height / 2));
    if (fallback) {
      plan.entrances.push(fallback);
      pushUniquePoint(plan.caveTiles, fallback);
    }
  }

  const visibleCaveCount = Math.max(caveScoreCount, plan.caveTiles.length);
  return {
    ...plan,
    areaRatio: clamp01(visibleCaveCount / Math.max(1, recipe.width * recipe.height)),
  };
}

function caveSeedPoints(
  tiles: readonly TileData[],
  recipe: GenerationRecipe,
  seedKey: bigint,
  count: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const minDistance = Math.max(6, Math.floor(Math.min(recipe.width, recipe.height) / 7));
  const centerX = Math.floor(recipe.width / 2);
  const centerY = Math.floor(recipe.height / 2);
  const attempts = Math.max(16, count * 28);
  for (let attempt = 0; attempt < attempts && points.length < count; attempt += 1) {
    const angle = unitNoise(seedKey, attempt, count, 0xc4a7e501n) * Math.PI * 2;
    const radius = Math.min(recipe.width, recipe.height) * (0.08 + unitNoise(seedKey, attempt, count, 0xc4a7e502n) * 0.34);
    const x = clampInteger(Math.round(centerX + Math.cos(angle) * radius), 2, recipe.width - 3);
    const y = clampInteger(Math.round(centerY + Math.sin(angle) * radius), 2, recipe.height - 3);
    const candidate = findWalkableTile(tiles, recipe.width, recipe.height, x, y);
    if (candidate && pointIsSpaced(points, candidate, minDistance)) {
      points.push(candidate);
    }
  }
  if (points.length === 0) {
    const fallback = findWalkableTile(tiles, recipe.width, recipe.height, centerX, centerY);
    if (fallback) {
      points.push(fallback);
    }
  }
  return points;
}

function caveRegionInfluence(centers: readonly { x: number; y: number }[], x: number, y: number, radius: number): number {
  let influence = 0;
  for (const center of centers) {
    const dx = (x - center.x) / (radius * 1.18);
    const dy = (y - center.y) / (radius * 0.88);
    influence = Math.max(influence, 1 - Math.sqrt(dx * dx + dy * dy));
  }
  return clamp01(influence);
}

function carveCaveBrush(plan: CavePlan, width: number, height: number, center: { x: number; y: number }, radius: number): void {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > radius + 1) {
        continue;
      }
      const x = center.x + dx;
      const y = center.y + dy;
      if (!pointInBounds(width, height, x, y)) {
        continue;
      }
      pushUniquePoint(plan.caveTiles, { x, y });
    }
  }
}

function nextCaveWalkStep(
  tiles: readonly TileData[],
  width: number,
  height: number,
  x: number,
  y: number,
  direction: number,
): { x: number; y: number; direction: number } {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidateDirection = (direction + attempt) % 4;
    const next = caveDirectionStep(x, y, candidateDirection);
    if (isCaveWalkableSourceTile(tiles, width, height, next.x, next.y)) {
      return { ...next, direction: candidateDirection };
    }
  }
  return { x, y, direction: (direction + 1) % 4 };
}

function caveDirectionStep(x: number, y: number, direction: number): { x: number; y: number } {
  if (direction === 0) {
    return { x: x + 1, y };
  }
  if (direction === 1) {
    return { x, y: y + 1 };
  }
  if (direction === 2) {
    return { x: x - 1, y };
  }
  return { x, y: y - 1 };
}

function isCaveWalkableSourceTile(tiles: readonly TileData[], width: number, height: number, x: number, y: number): boolean {
  if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) {
    return false;
  }
  const tile = tiles[y * width + x];
  return Boolean(tile) && tile.terrain !== "deep-water" && tile.terrain !== "water";
}

function pointIsSpaced(points: readonly { x: number; y: number }[], candidate: { x: number; y: number }, minDistance: number): boolean {
  return points.every((point) => Math.abs(point.x - candidate.x) + Math.abs(point.y - candidate.y) >= minDistance);
}

function buildRecipeKey(recipe: GenerationRecipe): string {
  return [
    recipe.engineVersion,
    recipe.seed,
    `${recipe.width}x${recipe.height}`,
    boolNumber(recipe.features.mountains)
      + boolNumber(recipe.features.forests)
      + boolNumber(recipe.features.trees)
      + boolNumber(recipe.features.roads)
      + boolNumber(recipe.features.caves)
      + boolNumber(recipe.features.rivers)
      + boolNumber(recipe.features.villages),
    recipe.algorithms.terrain,
    recipe.algorithms.cave,
    recipe.algorithms.road,
    recipe.algorithms.objectPlacement,
    recipe.params.waterLevel,
    recipe.params.mountainLevel,
    recipe.params.forestDensity,
    recipe.params.caveDensity,
    recipe.params.roadComplexity,
  ].join("|");
}

function tileHeight(
  terrainAlgorithm: string,
  seedKey: bigint,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  const falloff = islandFalloff(x, y, width, height);
  const coarse = unitNoise(seedKey, Math.trunc(x / 4), Math.trunc(y / 4), 0x5f3759dfn);
  const fine = unitNoise(seedKey, x, y, 0x85ebca6bn);

  if (terrainAlgorithm === "radial-island") {
    const ring = Math.sin(falloff * 10.5) * 0.035;
    return round4(clamp01(falloff * 0.88 + fine * 0.08 + ring));
  }

  const ridge = unitNoise(seedKey, Math.trunc(x / 9), Math.trunc(y / 3), 0x9e21ac89n);
  return round4(clamp01(falloff * 0.5 + coarse * 0.28 + fine * 0.14 + ridge * 0.08));
}

function classifyTerrain(height: number, forestNoise: number, recipe: GenerationRecipe): TerrainType {
  const waterLevel = effectiveWaterLevel(recipe);
  if (height < waterLevel - 0.08) {
    return "deep-water";
  }
  if (height < waterLevel) {
    return "water";
  }
  if (height < waterLevel + 0.04) {
    return "sand";
  }
  if (recipe.features.mountains && height >= mountainThreshold(recipe)) {
    return "mountain";
  }
  if (
    recipe.features.forests
    && height > waterLevel + 0.08
    && forestNoise < recipe.params.forestDensity
  ) {
    return "forest";
  }
  return "grass";
}

function createPlayableHeightMap(recipe: GenerationRecipe, seedKey: bigint): number[] {
  let heights = new Array<number>(recipe.width * recipe.height);
  for (let y = 0; y < recipe.height; y += 1) {
    for (let x = 0; x < recipe.width; x += 1) {
      heights[y * recipe.width + x] = tileHeight(recipe.algorithms.terrain, seedKey, x, y, recipe.width, recipe.height);
    }
  }

  const mountainIntensity = recipe.features.mountains ? recipe.params.mountainLevel : 0;
  const smoothingPasses = 1 + Math.round(recipe.params.waterLevel * 2 + (1 - mountainIntensity) * 2);
  for (let pass = 0; pass < smoothingPasses; pass += 1) {
    heights = smoothHeights(heights, recipe.width, recipe.height);
  }

  const lowlandBias = recipe.params.waterLevel * 0.06 + (1 - mountainIntensity) * 0.08;
  const amplitude = 0.74 + mountainIntensity * 0.22 - recipe.params.waterLevel * 0.08;
  heights = heights.map((height) => round4(clamp01(0.08 + height * amplitude - lowlandBias)));
  heights = limitHeightSlope(heights, recipe.width, recipe.height, 0.1 + mountainIntensity * 0.1, 2);
  heights = applyPlayableClearing(heights, recipe.width, recipe.height, [
    { x: Math.floor(recipe.width / 2), y: Math.floor(recipe.height / 2) },
  ], recipe);
  return limitHeightSlope(heights, recipe.width, recipe.height, 0.09 + mountainIntensity * 0.1, 2);
}

function applyPlayableClearing(
  source: readonly number[],
  width: number,
  height: number,
  anchors: readonly { x: number; y: number }[],
  recipe: GenerationRecipe,
): number[] {
  const result = [...source];
  const radius = Math.max(3, Math.round(Math.min(width, height) * 0.055));
  const target = clamp01(effectiveWaterLevel(recipe) + 0.08);
  for (const anchor of anchors) {
    for (let y = Math.max(0, anchor.y - radius); y <= Math.min(height - 1, anchor.y + radius); y += 1) {
      for (let x = Math.max(0, anchor.x - radius); x <= Math.min(width - 1, anchor.x + radius); x += 1) {
        const distance = Math.hypot(x - anchor.x, y - anchor.y);
        if (distance > radius) {
          continue;
        }
        const weight = (1 - distance / radius) ** 2 * 0.72;
        const index = y * width + x;
        result[index] = round4(clamp01(result[index] * (1 - weight) + target * weight));
      }
    }
  }
  return result;
}

function smoothHeights(source: readonly number[], width: number, height: number): number[] {
  const result = new Array<number>(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let weightedHeight = source[index] * 0.5;
      let totalWeight = 0.5;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }
          const weight = Math.abs(dx) + Math.abs(dy) === 1 ? 0.1 : 0.025;
          weightedHeight += source[nextY * width + nextX] * weight;
          totalWeight += weight;
        }
      }
      result[index] = round4(weightedHeight / totalWeight);
    }
  }
  return result;
}

function limitHeightSlope(source: readonly number[], width: number, height: number, maxDiff: number, iterations: number): number[] {
  let result = [...source];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = [...result];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (x + 1 < width) {
          constrainHeightPair(next, result, index, index + 1, maxDiff);
        }
        if (y + 1 < height) {
          constrainHeightPair(next, result, index, index + width, maxDiff);
        }
      }
    }
    result = next.map(round4);
  }
  return result;
}

function constrainHeightPair(next: number[], source: readonly number[], leftIndex: number, rightIndex: number, maxDiff: number): void {
  const left = source[leftIndex];
  const right = source[rightIndex];
  if (left - right > maxDiff) {
    next[leftIndex] = Math.min(next[leftIndex], right + maxDiff);
  } else if (right - left > maxDiff) {
    next[rightIndex] = Math.min(next[rightIndex], left + maxDiff);
  }
}

function applyRoadTrails(
  tiles: TileData[],
  recipe: GenerationRecipe,
  seedKey: bigint,
  caveEntrances: readonly { x: number; y: number }[],
): void {
  if (!recipe.features.roads || recipe.params.roadComplexity <= 0.08 || tiles.length === 0) {
    return;
  }

  if (recipe.algorithms.road === "astar") {
    const anchors = roadAnchorPoints(recipe, caveEntrances);
    const hub = findWalkableTile(tiles, recipe.width, recipe.height, Math.floor(recipe.width / 2), Math.floor(recipe.height / 2))
      ?? { x: Math.floor(recipe.width / 2), y: Math.floor(recipe.height / 2) };
    for (const anchor of anchors) {
      carveCostAwareRoadPath(tiles, recipe.width, recipe.height, hub, anchor, seedKey);
    }
    if (recipe.params.roadComplexity >= 0.65) {
      for (let index = 1; index < anchors.length; index += 1) {
        carveCostAwareRoadPath(tiles, recipe.width, recipe.height, anchors[index - 1], anchors[index], seedKey ^ BigInt(index));
      }
    }
    return;
  }

  const centerY = Math.floor(recipe.height / 2);
  const centerX = Math.floor(recipe.width / 2);
  const horizontalJitter = 1 + Math.round(recipe.params.roadComplexity * 2);
  const verticalJitter = recipe.params.roadComplexity >= 0.5;
  const brushRadius = recipe.params.roadComplexity >= 0.72 ? 1 : 0;

  for (let x = 0; x < recipe.width; x += 1) {
    const y = clampInteger(centerY + Math.round((unitNoise(seedKey, x, centerY, 0x4cf5ad43n) - 0.5) * horizontalJitter), 0, recipe.height - 1);
    markRoadBrush(tiles, recipe.width, recipe.height, x, y, brushRadius);
  }
  if (verticalJitter) {
    for (let y = 0; y < recipe.height; y += 1) {
      const x = clampInteger(centerX + Math.round((unitNoise(seedKey, centerX, y, 0x95a2f11dn) - 0.5) * horizontalJitter), 0, recipe.width - 1);
      markRoadBrush(tiles, recipe.width, recipe.height, x, y, brushRadius);
    }
  }
}

function roadAnchorPoints(recipe: GenerationRecipe, caveEntrances: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  const anchors = [...caveEntrances];
  anchors.push({ x: Math.floor(recipe.width / 2), y: Math.floor(recipe.height / 2) });
  anchors.push({ x: Math.max(1, Math.floor(recipe.width / 8)), y: Math.floor(recipe.height / 2) });
  anchors.push({ x: Math.max(1, recipe.width - Math.floor(recipe.width / 8) - 1), y: Math.floor(recipe.height / 2) });
  if (recipe.params.roadComplexity >= 0.45) {
    anchors.push({ x: Math.floor(recipe.width / 2), y: Math.max(1, Math.floor(recipe.height / 8)) });
    anchors.push({ x: Math.floor(recipe.width / 2), y: Math.max(1, recipe.height - Math.floor(recipe.height / 8) - 1) });
  }
  return anchors;
}

function carveRoadPath(
  tiles: TileData[],
  width: number,
  height: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  seedKey: bigint,
): void {
  let x = clampInteger(from.x, 0, width - 1);
  let y = clampInteger(from.y, 0, height - 1);
  const targetX = clampInteger(to.x, 0, width - 1);
  const targetY = clampInteger(to.y, 0, height - 1);
  const maxSteps = Math.max(width + height, width * 2 + height * 2);
  for (let step = 0; step < maxSteps && (x !== targetX || y !== targetY); step += 1) {
    markRoadBrush(tiles, width, height, x, y, 1);
    const dx = targetX - x;
    const dy = targetY - y;
    const preferX = Math.abs(dx) >= Math.abs(dy);
    const wobble = unitNoise(seedKey, x, y, 0x0badc0den);
    if ((preferX && wobble > 0.18) || wobble > 0.78) {
      x += dx > 0 ? 1 : dx < 0 ? -1 : 0;
    } else {
      y += dy > 0 ? 1 : dy < 0 ? -1 : 0;
    }
    x = clampInteger(x, 0, width - 1);
    y = clampInteger(y, 0, height - 1);
  }
  markRoadBrush(tiles, width, height, targetX, targetY, 1);
}

interface RoadSearchNode {
  priority: number;
  cost: number;
  index: number;
}

function carveCostAwareRoadPath(
  tiles: TileData[],
  width: number,
  height: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  seedKey: bigint,
): void {
  const start = findWalkableTile(tiles, width, height, from.x, from.y);
  const goal = findWalkableTile(tiles, width, height, to.x, to.y);
  if (!start || !goal) {
    carveRoadPath(tiles, width, height, from, to, seedKey);
    return;
  }

  const tileCount = width * height;
  const startIndex = start.y * width + start.x;
  const goalIndex = goal.y * width + goal.x;
  const costs = new Array<number>(tileCount).fill(Number.POSITIVE_INFINITY);
  const previous = new Array<number>(tileCount).fill(-1);
  const frontier: RoadSearchNode[] = [];
  costs[startIndex] = 0;
  heapPush(frontier, { priority: 0, cost: 0, index: startIndex });

  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  while (frontier.length > 0) {
    const current = heapPop(frontier);
    if (!current) {
      break;
    }
    if (current.index === goalIndex) {
      break;
    }
    if (current.cost !== costs[current.index]) {
      continue;
    }
    const x = current.index % width;
    const y = Math.floor(current.index / width);
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (!pointInBounds(width, height, nx, ny)) {
        continue;
      }
      const neighborIndex = ny * width + nx;
      const neighbor = tiles[neighborIndex];
      const stepCost = roadStepCost(neighbor);
      if (stepCost >= 1_000_000) {
        continue;
      }
      const noiseBias = Math.round(unitNoise(seedKey, nx, ny, 0xa51a7e55n) * 3);
      const nextCost = current.cost + stepCost + noiseBias;
      if (nextCost >= costs[neighborIndex]) {
        continue;
      }
      costs[neighborIndex] = nextCost;
      previous[neighborIndex] = current.index;
      const heuristic = (Math.abs(goal.x - nx) + Math.abs(goal.y - ny)) * 6;
      heapPush(frontier, { priority: nextCost + heuristic, cost: nextCost, index: neighborIndex });
    }
  }

  if (previous[goalIndex] < 0 && startIndex !== goalIndex) {
    carveRoadPath(tiles, width, height, from, to, seedKey);
    return;
  }

  let cursor = goalIndex;
  let guard = 0;
  while (cursor >= 0 && guard <= tileCount) {
    const x = cursor % width;
    const y = Math.floor(cursor / width);
    markRoadBrush(tiles, width, height, x, y, 1);
    if (cursor === startIndex) {
      break;
    }
    cursor = previous[cursor];
    guard += 1;
  }
}

function roadStepCost(tile: TileData | undefined): number {
  if (!tile || tile.blocked || tile.terrain === "deep-water" || tile.terrain === "water" || tile.terrain === "cave-floor" || tile.terrain === "cave-wall") {
    return 1_000_000;
  }
  if (tile.terrain === "sand" || tile.terrain === "grass") {
    return 8;
  }
  if (tile.terrain === "forest") {
    return 18;
  }
  if (tile.terrain === "mountain") {
    return 120;
  }
  return Math.max(2, tile.cost);
}

function heapPush(heap: RoadSearchNode[], node: RoadSearchNode): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].priority <= node.priority) {
      break;
    }
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = node;
}

function heapPop(heap: RoadSearchNode[]): RoadSearchNode | undefined {
  if (heap.length === 0) {
    return undefined;
  }
  const first = heap[0];
  const last = heap.pop();
  if (!last || heap.length === 0) {
    return first;
  }
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) {
      break;
    }
    const child = right < heap.length && heap[right].priority < heap[left].priority ? right : left;
    if (heap[child].priority >= last.priority) {
      break;
    }
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = last;
  return first;
}

function markRoadTile(tiles: TileData[], width: number, x: number, y: number): void {
  const tile = tiles[y * width + x];
  if (!tile || tile.blocked || tile.terrain === "mountain" || tile.terrain === "cave-floor" || tile.terrain === "cave-wall") {
    return;
  }
  tile.terrain = "road";
  tile.cost = movementCost("road");
}

function markRoadBrush(tiles: TileData[], width: number, height: number, x: number, y: number, radius: number): void {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > radius + 1) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (!pointInBounds(width, height, nx, ny)) {
        continue;
      }
      markRoadTile(tiles, width, nx, ny);
    }
  }
}

function placeObjects(
  tiles: TileData[],
  recipe: GenerationRecipe,
  caveEntrances: readonly { x: number; y: number }[],
  seedKey: bigint,
): MapObject[] {
  const objects: MapObject[] = [];
  const occupied = new Set<string>();

  for (const entrance of caveEntrances) {
    addObject(objects, occupied, tiles, recipe.width, "cave-entrance", entrance.x, entrance.y);
  }

  const tileCount = Math.max(1, recipe.width * recipe.height);
  const maxTrees = recipe.features.trees ? Math.max(8, Math.min(1600, Math.floor(tileCount / 64))) : 0;
  const maxRocks = recipe.features.mountains ? Math.max(4, Math.min(520, Math.floor(tileCount / 180))) : 0;
  const maxVillages = recipe.features.villages ? Math.max(1, Math.min(8, Math.floor(tileCount / 9000) + 1)) : 0;
  const treeTarget = scaledTarget(maxTrees, recipe.params.forestDensity, recipe.algorithms.objectPlacement === "biome-density" ? 0.9 : 0.7);
  const rockTarget = scaledTarget(maxRocks, recipe.params.mountainLevel, 0.55);
  const villageTarget = scaledTarget(maxVillages, recipe.params.forestDensity, 0.65);

  addRankedObjects(
    objects,
    occupied,
    tiles,
    recipe.width,
    "tree",
    treeCandidates(tiles, recipe, seedKey),
    treeTarget,
    recipe.algorithms.objectPlacement === "biome-density" ? 3 : 8,
  );
  addRankedObjects(
    objects,
    occupied,
    tiles,
    recipe.width,
    "rock",
    rockCandidates(tiles, recipe, seedKey),
    rockTarget,
    recipe.algorithms.objectPlacement === "biome-density" ? 4 : 10,
  );
  addRankedObjects(
    objects,
    occupied,
    tiles,
    recipe.width,
    "village",
    villageCandidates(tiles, recipe, seedKey),
    villageTarget,
    18,
  );

  return objects;
}

function addRankedObjects(
  objects: MapObject[],
  occupied: Set<string>,
  tiles: TileData[],
  width: number,
  type: MapObject["type"],
  candidates: ObjectCandidate[],
  target: number,
  minDistance: number,
): number {
  if (target <= 0 || candidates.length === 0) {
    return 0;
  }
  const sorted = [...candidates].sort((left, right) => right.score - left.score);
  const selected: { x: number; y: number }[] = [];
  let placed = 0;
  for (const candidate of sorted) {
    if (placed >= target) {
      break;
    }
    if (occupied.has(`${candidate.x}:${candidate.y}`) || !isSpacedFrom(selected, candidate, minDistance)) {
      continue;
    }
    addObject(objects, occupied, tiles, width, type, candidate.x, candidate.y);
    selected.push(candidate);
    placed += 1;
  }
  if (placed >= Math.min(target, 8) || minDistance <= 1) {
    return placed;
  }
  return placed + addRankedObjects(objects, occupied, tiles, width, type, sorted, target - placed, Math.max(1, Math.floor(minDistance / 2)));
}

function treeCandidates(tiles: readonly TileData[], recipe: GenerationRecipe, seedKey: bigint): ObjectCandidate[] {
  const candidates: ObjectCandidate[] = [];
  const biomeMode = recipe.algorithms.objectPlacement === "biome-density";
  forEachObjectCandidateTile(tiles, recipe, (tile, x, y) => {
    if (biomeMode && tile.terrain !== "forest") {
      return;
    }
    if (!biomeMode && tile.terrain !== "forest" && tile.terrain !== "grass") {
      return;
    }
    const biomeScore = biomeMode ? unitNoise(seedKey, Math.floor(x / 18), Math.floor(y / 18), 0xb10bed00n) * 0.72 : 0;
    const spreadScore = unitNoise(seedKey, x, y, biomeMode ? 0x77ee0001n : 0x51ca77e5n);
    const terrainScore = tile.terrain === "forest" ? 0.22 : 0;
    candidates.push({ x, y, score: biomeScore + spreadScore + terrainScore });
  });
  return candidates;
}

function rockCandidates(tiles: readonly TileData[], recipe: GenerationRecipe, seedKey: bigint): ObjectCandidate[] {
  const candidates: ObjectCandidate[] = [];
  forEachObjectCandidateTile(tiles, recipe, (tile, x, y) => {
    if (tile.terrain !== "mountain") {
      return;
    }
    const ridgeScore = unitNoise(seedKey, Math.floor(x / 12), Math.floor(y / 12), 0x70cce000n) * 0.5;
    const localScore = unitNoise(seedKey, x, y, 0x70cce777n);
    candidates.push({ x, y, score: ridgeScore + localScore });
  });
  return candidates;
}

function villageCandidates(tiles: readonly TileData[], recipe: GenerationRecipe, seedKey: bigint): ObjectCandidate[] {
  const candidates: ObjectCandidate[] = [];
  forEachObjectCandidateTile(tiles, recipe, (tile, x, y) => {
    if (tile.terrain !== "grass" && tile.terrain !== "road") {
      return;
    }
    const roadScore = tile.terrain === "road" ? 0.45 : 0;
    const localScore = unitNoise(seedKey, x, y, 0x711a9e55n);
    candidates.push({ x, y, score: roadScore + localScore });
  });
  return candidates;
}

function forEachObjectCandidateTile(
  tiles: readonly TileData[],
  recipe: GenerationRecipe,
  visit: (tile: TileData, x: number, y: number) => void,
): void {
  const stride = recipe.width >= 512 || recipe.height >= 512 ? 2 : 1;
  for (let y = 2; y < recipe.height - 2; y += 1) {
    for (let x = 2 + ((y * 17 + recipe.seed) % stride); x < recipe.width - 2; x += stride) {
      const tile = tiles[y * recipe.width + x];
      if (!tile || tile.blocked || tile.terrain === "water" || tile.terrain === "deep-water" || tile.terrain === "cave-floor" || tile.terrain === "cave-wall") {
        continue;
      }
      visit(tile, x, y);
    }
  }
}

function scaledTarget(max: number, density: number, weight: number): number {
  if (max <= 0) {
    return 0;
  }
  return clampInteger(Math.round(max * clamp01(density) * weight), 0, max);
}

function isSpacedFrom(points: readonly { x: number; y: number }[], candidate: { x: number; y: number }, minDistance: number): boolean {
  const minDistanceSquared = minDistance * minDistance;
  return points.every((point) => {
    const dx = point.x - candidate.x;
    const dy = point.y - candidate.y;
    return dx * dx + dy * dy >= minDistanceSquared;
  });
}

function addObject(
  objects: MapObject[],
  occupied: Set<string>,
  tiles: TileData[],
  width: number,
  type: MapObject["type"],
  x: number,
  y: number,
): void {
  const key = `${x}:${y}`;
  if (occupied.has(key)) {
    return;
  }
  objects.push({
    id: `${type}-${objects.length + 1}`,
    type,
    layerId: "surface",
    x,
    y,
  });
  occupied.add(key);
  if (type === "tree" || type === "rock") {
    const tile = tiles[y * width + x];
    if (tile) {
      tile.blocked = true;
      tile.cost = 255;
    }
  }
}

function effectiveWaterLevel(recipe: GenerationRecipe): number {
  return clamp01(0.18 + recipe.params.waterLevel * 0.46);
}

function mountainThreshold(recipe: GenerationRecipe): number {
  const intensity = recipe.features.mountains ? recipe.params.mountainLevel : 0;
  return clamp01(0.72 + (1 - intensity) * 0.22);
}

function isBlocked(terrain: TerrainType): boolean {
  return terrain === "deep-water" || terrain === "water" || terrain === "cave-wall";
}

function movementCost(terrain: TerrainType): number {
  if (terrain === "deep-water" || terrain === "water" || terrain === "cave-wall") {
    return 255;
  }
  if (terrain === "road") {
    return 1;
  }
  if (terrain === "forest") {
    return 4;
  }
  if (terrain === "mountain") {
    return 8;
  }
  return 2;
}

function islandFalloff(x: number, y: number, width: number, height: number): number {
  const nx = ((x + 0.5) / width) * 2 - 1;
  const ny = ((y + 0.5) / height) * 2 - 1;
  const distance = Math.sqrt(nx * nx + ny * ny);
  return clamp01(1 - distance * 0.82);
}

function unitNoise(seedKey: bigint, x: number, y: number, salt: bigint): number {
  const mixed = splitmix64(
    seedKey
      ^ ((BigInt(x) * 0x9e3779b185ebca87n) & MASK_64)
      ^ ((BigInt(y) * 0xc2b2ae3d27d4eb4fn) & MASK_64)
      ^ salt,
  );
  return Number(mixed >> 11n) / 9007199254740992;
}

function splitmix64(value: bigint): bigint {
  let next = (value + 0x9e3779b97f4a7c15n) & MASK_64;
  next = ((next ^ (next >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
  next = ((next ^ (next >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
  return (next ^ (next >> 31n)) & MASK_64;
}

function fnv1a(value: string): bigint {
  let hash = FNV_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

function hashHex(hash: bigint): string {
  return hash.toString(16).padStart(16, "0");
}

function boolNumber(value: boolean): string {
  return value ? "1" : "0";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
