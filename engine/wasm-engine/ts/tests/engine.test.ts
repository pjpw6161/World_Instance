import { defaultRecipe, type GenerationRecipe, type MapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import { createDeterministicDevModule, createWorldForgeWasmEngine } from "../src";

function testEngine() {
  return createWorldForgeWasmEngine({
    moduleFactory: async () => createDeterministicDevModule(),
  });
}

function recipeWith(overrides: Partial<GenerationRecipe>): GenerationRecipe {
  return {
    ...defaultRecipe,
    ...overrides,
    features: {
      ...defaultRecipe.features,
      ...overrides.features,
    },
    algorithms: {
      ...defaultRecipe.algorithms,
      ...overrides.algorithms,
    },
    params: {
      ...defaultRecipe.params,
      ...overrides.params,
    },
  };
}

describe("WorldForgeWasmEngine wrapper", () => {
  it("loads a low-level engine module", async () => {
    const engine = testEngine();

    expect(engine.status()).toBe("unloaded");
    await engine.load();

    expect(engine.status()).toBe("ready");
    expect(engine.engineVersion()).toBe("0.1.0");
  });

  it("returns the same map hash for the same recipe", async () => {
    const engine = testEngine();
    const recipe = recipeWith({ width: 64, height: 64, seed: 777 });

    const first = await engine.generate(recipe);
    const second = await engine.generate(recipe);

    expect(first.mapHash).toBe(second.mapHash);
    expect(first.heightMap).toHaveLength(recipe.width * recipe.height);
    expect(first.terrainMap).toHaveLength(recipe.width * recipe.height);
    expect(first.collisionMap).toHaveLength(recipe.width * recipe.height);
    expect(first.costMap).toHaveLength(recipe.width * recipe.height);
  });

  it("usually returns a different hash for a different seed", async () => {
    const engine = testEngine();
    const first = await engine.generate(recipeWith({ width: 64, height: 64, seed: 777 }));
    const second = await engine.generate(recipeWith({ width: 64, height: 64, seed: 778 }));

    expect(first.mapHash).not.toBe(second.mapHash);
  });

  it("does not emit disabled forest or mountain terrain", async () => {
    const engine = testEngine();
    const map = await engine.generate(
      recipeWith({
        width: 64,
        height: 64,
        features: {
          ...defaultRecipe.features,
          forests: false,
          mountains: false,
        },
        params: {
          ...defaultRecipe.params,
          forestDensity: 1,
          mountainLevel: 0,
        },
      }),
    );

    expect(map.terrainMap).not.toContain("forest");
    expect(map.terrainMap).not.toContain("mountain");
  });

  it("emits cave transition portals when caves are enabled", async () => {
    const engine = testEngine();
    const map = await engine.generate(
      recipeWith({
        width: 64,
        height: 64,
        features: {
          ...defaultRecipe.features,
          caves: true,
        },
      }),
    );

    expect(map.portalList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromLayerId: "surface", toLayerId: "cave" }),
        expect.objectContaining({ fromLayerId: "cave", toLayerId: "surface" }),
      ]),
    );
  });

  it("keeps high-water low-mountain worlds smooth and mostly lowland", async () => {
    const engine = testEngine();
    const map = await engine.generate(
      recipeWith({
        width: 64,
        height: 64,
        features: {
          ...defaultRecipe.features,
          mountains: true,
        },
        params: {
          ...defaultRecipe.params,
          waterLevel: 0.9,
          mountainLevel: 0,
        },
      }),
    );

    expect(map.stats.mountainRatio).toBeLessThan(0.03);
    expect(maxAdjacentHeightDiff(map.heightMap, map.width, map.height)).toBeLessThanOrEqual(0.2);
  });

  it("uses road complexity to create low-cost trail tiles", async () => {
    const engine = testEngine();
    const map = await engine.generate(
      recipeWith({
        width: 64,
        height: 64,
        features: {
          ...defaultRecipe.features,
          roads: true,
        },
        params: {
          ...defaultRecipe.params,
          roadComplexity: 0.9,
        },
      }),
    );

    expect(map.stats.roadLength).toBeGreaterThan(0);
    expect(map.terrainMap).toContain("road");
  });

  it("uses terrain algorithm selection to produce distinct terrain", async () => {
    const engine = testEngine();
    const base = recipeWith({ width: 64, height: 64, seed: 9911 });

    const noise = await engine.generate({ ...base, algorithms: { ...base.algorithms, terrain: "noise-island" } });
    const radial = await engine.generate({ ...base, algorithms: { ...base.algorithms, terrain: "radial-island" } });

    expect(noise.mapHash).not.toBe(radial.mapHash);
    expect(noise.heightMap).not.toEqual(radial.heightMap);
  });

  it("uses cave algorithm selection to produce distinct cave footprints", async () => {
    const engine = testEngine();
    const base = recipeWith({
      width: 64,
      height: 64,
      seed: 1122,
      features: { ...defaultRecipe.features, caves: true },
      params: { ...defaultRecipe.params, caveDensity: 0.9 },
    });

    const cellular = await engine.generate({ ...base, algorithms: { ...base.algorithms, cave: "cellular-automata" } });
    const randomWalk = await engine.generate({ ...base, algorithms: { ...base.algorithms, cave: "random-walk" } });

    expect(cellular.portalList.length).toBeGreaterThan(0);
    expect(randomWalk.portalList.length).toBeGreaterThan(0);
    expect(terrainCount(cellular, "cave-floor")).toBeGreaterThan(0);
    expect(terrainCount(randomWalk, "cave-floor")).toBeGreaterThan(0);
    expect(terrainCount(cellular, "cave-wall")).toBeGreaterThan(0);
    expect(terrainCount(randomWalk, "cave-wall")).toBeGreaterThan(0);
    expect(terrainCount(randomWalk, "cave-floor")).toBeGreaterThan(80);
    expect(caveCoordinateSpread(randomWalk)).toBeGreaterThan(24);
    expect(Math.abs(cellular.stats.caveAreaRatio - randomWalk.stats.caveAreaRatio)).toBeGreaterThan(0.005);
    expect(cellular.stats.caveAreaRatio).toBeLessThan(0.35);
    expect(randomWalk.stats.caveAreaRatio).toBeLessThan(0.35);
    expect(caveTiles(cellular)).not.toEqual(caveTiles(randomWalk));
    expect(cellular.portalList.map((portal) => `${portal.x}:${portal.y}`)).not.toEqual(
      randomWalk.portalList.map((portal) => `${portal.x}:${portal.y}`),
    );
  });

  it("uses road algorithm selection to produce distinct road layouts", async () => {
    const engine = testEngine();
    const base = recipeWith({
      width: 64,
      height: 64,
      seed: 3344,
      features: { ...defaultRecipe.features, roads: true, caves: true },
      params: { ...defaultRecipe.params, roadComplexity: 0.9, caveDensity: 0.8 },
    });

    const astar = await engine.generate({ ...base, algorithms: { ...base.algorithms, road: "astar" } });
    const simplePath = await engine.generate({ ...base, algorithms: { ...base.algorithms, road: "simple-path" } });

    expect(astar.stats.roadLength).toBeGreaterThan(0);
    expect(simplePath.stats.roadLength).toBeGreaterThan(0);
    expect(astar.stats.roadLength).toBeGreaterThan(80);
    expect(simplePath.stats.roadLength).toBeGreaterThan(80);
    expect(roadTiles(astar)).not.toEqual(roadTiles(simplePath));
  });

  it("uses object placement algorithm selection to produce distinct objects", async () => {
    const engine = testEngine();
    const base = recipeWith({
      width: 64,
      height: 64,
      seed: 5566,
      features: { ...defaultRecipe.features, trees: true, villages: true },
      params: { ...defaultRecipe.params, forestDensity: 0.95 },
    });

    const biomeDensity = await engine.generate({ ...base, algorithms: { ...base.algorithms, objectPlacement: "biome-density" } });
    const scatter = await engine.generate({ ...base, algorithms: { ...base.algorithms, objectPlacement: "scatter" } });

    expect(biomeDensity.objectList.length).toBeGreaterThan(0);
    expect(scatter.objectList.length).toBeGreaterThan(0);
    expect(objectCount(biomeDensity, "tree")).toBeGreaterThanOrEqual(20);
    expect(objectCount(scatter, "tree")).toBeGreaterThanOrEqual(20);
    expect(ySpread(scatter, "tree")).toBeGreaterThan(20);
    expect(biomeDensity.objectList.map((object) => `${object.type}:${object.x}:${object.y}`)).not.toEqual(
      scatter.objectList.map((object) => `${object.type}:${object.x}:${object.y}`),
    );
  });

  it("scales object count with forest density instead of filling from the top rows", async () => {
    const engine = testEngine();
    const base = recipeWith({
      width: 128,
      height: 128,
      seed: 7001,
      features: { ...defaultRecipe.features, trees: true, villages: true },
      algorithms: { ...defaultRecipe.algorithms, objectPlacement: "scatter" },
    });

    const sparse = await engine.generate({ ...base, params: { ...base.params, forestDensity: 0.2 } });
    const dense = await engine.generate({ ...base, params: { ...base.params, forestDensity: 0.95 } });

    expect(objectCount(sparse, "tree")).toBeLessThan(objectCount(dense, "tree"));
    expect(ySpread(dense, "tree")).toBeGreaterThan(32);
  });

  it("rejects invalid recipes before calling the low-level module", async () => {
    const engine = testEngine();

    await expect(engine.generate(recipeWith({ width: 1 }))).rejects.toThrow("width");
  });
});

function maxAdjacentHeightDiff(heightMap: readonly number[], width: number, height: number): number {
  let maxDiff = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x + 1 < width) {
        maxDiff = Math.max(maxDiff, Math.abs((heightMap[index] ?? 0) - (heightMap[index + 1] ?? 0)));
      }
      if (y + 1 < height) {
        maxDiff = Math.max(maxDiff, Math.abs((heightMap[index] ?? 0) - (heightMap[index + width] ?? 0)));
      }
    }
  }
  return maxDiff;
}

function roadTiles(map: MapData): string[] {
  return map.terrainMap
    .map((terrain, index) => terrain === "road" ? `${index % map.width}:${Math.floor(index / map.width)}` : "")
    .filter(Boolean);
}

function caveTiles(map: MapData): string[] {
  return map.terrainMap
    .map((terrain, index) => terrain === "cave-floor" || terrain === "cave-wall" ? `${terrain}:${index % map.width}:${Math.floor(index / map.width)}` : "")
    .filter(Boolean);
}

function caveCoordinateSpread(map: MapData): number {
  const coordinates = map.terrainMap
    .map((terrain, index) => terrain === "cave-floor" || terrain === "cave-wall" ? { x: index % map.width, y: Math.floor(index / map.width) } : null)
    .filter((coordinate): coordinate is { x: number; y: number } => coordinate !== null);
  const xs = coordinates.map((coordinate) => coordinate.x);
  const ys = coordinates.map((coordinate) => coordinate.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function terrainCount(map: MapData, terrain: string): number {
  return map.terrainMap.filter((candidate) => candidate === terrain).length;
}

function objectCount(map: MapData, type: string): number {
  return map.objectList.filter((object) => object.type === type).length;
}

function ySpread(map: MapData, type: string): number {
  const ys = map.objectList.filter((object) => object.type === type).map((object) => object.y);
  return Math.max(...ys) - Math.min(...ys);
}
