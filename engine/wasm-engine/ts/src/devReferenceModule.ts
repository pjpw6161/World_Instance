import type { GenerationRecipe, TerrainType } from "@world-forge/shared";
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
  const tiles: TileData[] = [];

  let waterCount = 0;
  let landCount = 0;
  let forestCount = 0;
  let mountainCount = 0;
  let blockedCount = 0;
  let hashInput = `${recipeKey}|`;

  for (let y = 0; y < recipe.height; y += 1) {
    for (let x = 0; x < recipe.width; x += 1) {
      const height = tileHeight(recipe.algorithms.terrain, seedKey, x, y, recipe.width, recipe.height);
      const forestNoise = unitNoise(seedKey, x, y, 0x27d4eb2fn);
      const terrain = classifyTerrain(height, forestNoise, recipe);
      const blocked = isBlocked(terrain);
      const cost = movementCost(terrain);
      tiles.push({ height, terrain, blocked, cost });
      hashInput += `${Math.trunc(height * 10000)}:${terrain}:${blocked ? 1 : 0}:${cost};`;

      if (terrain === "deep-water" || terrain === "water") {
        waterCount += 1;
      } else {
        landCount += 1;
      }
      if (terrain === "forest") {
        forestCount += 1;
      }
      if (terrain === "mountain") {
        mountainCount += 1;
      }
      if (blocked) {
        blockedCount += 1;
      }
    }
  }

  const tileCount = Math.max(1, recipe.width * recipe.height);
  return JSON.stringify({
    width: recipe.width,
    height: recipe.height,
    heightMap: tiles.map((tile) => tile.height),
    terrainMap: tiles.map((tile) => tile.terrain),
    objectList: [],
    collisionMap: tiles.map((tile) => tile.blocked),
    costMap: tiles.map((tile) => tile.cost),
    portalList: [],
    stats: {
      waterRatio: round4(waterCount / tileCount),
      landRatio: round4(landCount / tileCount),
      forestRatio: round4(forestCount / tileCount),
      mountainRatio: round4(mountainCount / tileCount),
      treeCount: 0,
      roadLength: 0,
      caveAreaRatio: 0,
      villageCount: 0,
      blockedRatio: round4(blockedCount / tileCount),
      generationTimeMs: 0,
    },
    mapHash: hashHex(fnv1a(hashInput)),
  });
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
    return round4(clamp01(falloff * 0.88 + fine * 0.12));
  }

  return round4(clamp01(falloff * 0.56 + coarse * 0.3 + fine * 0.14));
}

function classifyTerrain(height: number, forestNoise: number, recipe: GenerationRecipe): TerrainType {
  if (height < recipe.params.waterLevel - 0.08) {
    return "deep-water";
  }
  if (height < recipe.params.waterLevel) {
    return "water";
  }
  if (height < recipe.params.waterLevel + 0.04) {
    return "sand";
  }
  if (recipe.features.mountains && height >= recipe.params.mountainLevel) {
    return "mountain";
  }
  if (
    recipe.features.forests
    && height > recipe.params.waterLevel + 0.08
    && forestNoise < recipe.params.forestDensity
  ) {
    return "forest";
  }
  return "grass";
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

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
