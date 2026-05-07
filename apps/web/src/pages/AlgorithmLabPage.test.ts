import { defaultRecipe, type AlgorithmSelection, type MapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import { calculateMapDifferenceSummary, prepareSideBySideRecipe, resolveComparisonPreviewMode } from "./AlgorithmLabPage";

const customAlgorithms: AlgorithmSelection = {
  terrain: "radial-island",
  cave: "random-walk",
  road: "astar",
  objectPlacement: "scatter",
};

describe("AlgorithmLabPage helpers", () => {
  it("prepares a side-by-side recipe with all selected algorithms", () => {
    const recipe = prepareSideBySideRecipe(defaultRecipe, customAlgorithms);

    expect(recipe.algorithms).toEqual(customAlgorithms);
  });

  it("enables feature and density inputs that make all algorithm families visible", () => {
    const recipe = prepareSideBySideRecipe(
      {
        ...defaultRecipe,
        features: {
          ...defaultRecipe.features,
          forests: false,
          trees: false,
          roads: false,
          caves: false,
          villages: false,
        },
        params: {
          ...defaultRecipe.params,
          forestDensity: 0.1,
          caveDensity: 0.1,
          roadComplexity: 0.1,
        },
      },
      customAlgorithms,
    );

    expect(recipe.features.forests).toBe(true);
    expect(recipe.features.trees).toBe(true);
    expect(recipe.features.roads).toBe(true);
    expect(recipe.features.caves).toBe(true);
    expect(recipe.features.villages).toBe(true);
    expect(recipe.features.mountains).toBe(true);
    expect(recipe.params.mountainLevel).toBeGreaterThanOrEqual(0.52);
    expect(recipe.params.forestDensity).toBeGreaterThanOrEqual(0.84);
    expect(recipe.params.caveDensity).toBeGreaterThanOrEqual(0.68);
    expect(recipe.params.roadComplexity).toBeGreaterThanOrEqual(0.96);
  });

  it("uses comparison tuning for cave, road, and object visibility", () => {
    const recipe = prepareSideBySideRecipe(defaultRecipe, customAlgorithms, {
      caveDensity: 0.73,
      roadComplexity: 0.81,
      objectDensity: 0.91,
    });

    expect(recipe.params.caveDensity).toBeGreaterThanOrEqual(0.73);
    expect(recipe.params.roadComplexity).toBeGreaterThanOrEqual(0.81);
    expect(recipe.params.forestDensity).toBeGreaterThanOrEqual(0.91);
  });

  it("auto-focuses all changed overlays when multiple algorithm categories differ", () => {
    expect(resolveComparisonPreviewMode("auto", ["cave", "road"])).toBe("all");
    expect(resolveComparisonPreviewMode("auto", ["road", "terrain"])).toBe("all");
    expect(resolveComparisonPreviewMode("auto", ["objectPlacement", "terrain"])).toBe("all");
    expect(resolveComparisonPreviewMode("auto", ["terrain"])).toBe("surface");
  });

  it("respects explicit preview mode selection", () => {
    expect(resolveComparisonPreviewMode("road", ["cave"])).toBe("road");
    expect(resolveComparisonPreviewMode("difference", ["terrain"])).toBe("difference");
  });

  it("summarizes tile, movement, height, and object differences", () => {
    const left = mapDataFixture({
      terrainMap: ["grass", "water", "road", "forest"],
      heightMap: [0.2, 0.1, 0.24, 0.4],
      collisionMap: [false, true, false, false],
      costMap: [2, 255, 1, 4],
      objectList: [{ id: "tree-1", type: "tree", layerId: "surface", x: 0, y: 0 }],
    });
    const right = mapDataFixture({
      terrainMap: ["grass", "grass", "road", "forest"],
      heightMap: [0.2, 0.18, 0.24, 0.46],
      collisionMap: [false, false, false, false],
      costMap: [2, 2, 1, 4],
      objectList: [{ id: "rock-1", type: "rock", layerId: "surface", x: 1, y: 1 }],
    });

    const summary = calculateMapDifferenceSummary(left, right);

    expect(summary.terrainChanged).toBe(1);
    expect(summary.heightChanged).toBe(2);
    expect(summary.collisionChanged).toBe(1);
    expect(summary.costChanged).toBe(1);
    expect(summary.objectChanged).toBe(2);
    expect(summary.changedTiles).toBe(3);
    expect(summary.changedRatio).toBe(0.75);
  });
});

function mapDataFixture(overrides: Partial<MapData>): MapData {
  return {
    width: 2,
    height: 2,
    heightMap: [0.2, 0.2, 0.2, 0.2],
    terrainMap: ["grass", "grass", "grass", "grass"],
    objectList: [],
    collisionMap: [false, false, false, false],
    costMap: [2, 2, 2, 2],
    portalList: [],
    stats: {
      waterRatio: 0,
      landRatio: 1,
      forestRatio: 0,
      mountainRatio: 0,
      treeCount: 0,
      roadLength: 0,
      caveAreaRatio: 0,
      villageCount: 0,
      blockedRatio: 0,
      generationTimeMs: 0,
    },
    mapHash: "fixture",
    ...overrides,
  };
}
