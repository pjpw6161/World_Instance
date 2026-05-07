import { sampleMapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import {
  createTerrainMeshData,
  createVisualHeightMap,
  entityToTerrainPosition,
  heightDiffMovementReadiness,
  terrainLayerSceneStyle,
  tileToTerrainPosition,
} from "./terrain3d";
import type { WorldEntity } from "./worldState";

describe("terrain 3D mesh data", () => {
  it("creates sampled vertices and triangle indices from MapData heightMap", () => {
    const meshData = createTerrainMeshData(sampleMapData, {
      heightScale: 5,
      maxSamples: 2,
      terrainWidth: 10,
    });

    expect(meshData.columns).toBe(2);
    expect(meshData.rows).toBe(2);
    expect(meshData.positions).toHaveLength(12);
    expect(meshData.colors).toHaveLength(12);
    expect(meshData.indices).toHaveLength(6);
    expect(meshData.visualHeightMap).toHaveLength(4);
    expect(meshData.positions[1]).toBeCloseTo(meshData.visualHeightMap[0] * 5);
    expect(meshData.positions[10]).toBeCloseTo(meshData.visualHeightMap[3] * 5);
    expect(meshData.visualHeightMap[3]).toBeLessThan(sampleMapData.heightMap[3]);
  });

  it("creates a smoothed terraced visual height map for diorama rendering", () => {
    const visualHeightMap = createVisualHeightMap(sampleMapData, {
      smoothingPasses: 1,
      terraceSteps: 7,
    });

    expect(visualHeightMap).toHaveLength(sampleMapData.width * sampleMapData.height);
    expect(visualHeightMap[0]).toBeLessThan(0.15);
    expect(visualHeightMap[3]).toBeGreaterThan(visualHeightMap[1]);
    expect(visualHeightMap[3]).toBeLessThan(sampleMapData.heightMap[3]);
  });

  it("limits visual spikes and creates a more playable diorama surface", () => {
    const mapData = {
      ...sampleMapData,
      width: 5,
      height: 5,
      heightMap: [
        0.12, 0.16, 0.18, 0.16, 0.12,
        0.16, 0.24, 0.34, 0.24, 0.16,
        0.18, 0.34, 1, 0.34, 0.18,
        0.16, 0.24, 0.34, 0.24, 0.16,
        0.12, 0.16, 0.18, 0.16, 0.12,
      ],
      terrainMap: new Array(25).fill("grass"),
      collisionMap: new Array(25).fill(false),
      costMap: new Array(25).fill(2),
      portalList: [],
      objectList: [],
      stats: {
        ...sampleMapData.stats,
        waterRatio: 0.05,
        mountainRatio: 0,
      },
    } as const;

    const visualHeightMap = createVisualHeightMap(mapData, {
      smoothingPasses: 3,
      terraceSteps: 8,
    });

    expect(visualHeightMap[12]).toBeLessThan(0.45);
    expect(maxAdjacentHeightDiff(visualHeightMap, mapData.width, mapData.height)).toBeLessThanOrEqual(0.12);
  });

  it("projects world entities onto the same terrain coordinate system", () => {
    const meshData = createTerrainMeshData(sampleMapData, {
      heightScale: 5,
      maxSamples: 2,
      terrainWidth: 10,
    });
    const entity: WorldEntity = {
      worldInstanceId: "world-1",
      entityKey: "player",
      entityType: "player",
      layerId: "surface",
      x: 1,
      y: 1,
      z: null,
      homeX: null,
      homeY: null,
      movementCostMultiplier: 1,
      jumpHeight: 1,
      maxSlope: 0.35,
      state: "idle",
      behavior: "manual",
      metadataJson: {},
    };

    const position = entityToTerrainPosition(sampleMapData, entity, meshData, 0.25);

    expect(position.x).toBeCloseTo(5);
    expect(position.y).toBeCloseTo(meshData.visualHeightMap[3] * 5 + 0.25);
    expect(position.z).toBeCloseTo(5);
  });

  it("projects map tiles onto the same coordinate system used by entities", () => {
    const meshData = createTerrainMeshData(sampleMapData, {
      heightScale: 5,
      maxSamples: 2,
      terrainWidth: 10,
    });

    const position = tileToTerrainPosition(sampleMapData, 1, 1, meshData, 0.25);

    expect(position.x).toBeCloseTo(5);
    expect(position.y).toBeCloseTo(meshData.visualHeightMap[3] * 5 + 0.25);
    expect(position.z).toBeCloseTo(5);
  });

  it("creates a distinct cave scene from the same MapData", () => {
    const surfaceMesh = createTerrainMeshData(sampleMapData, {
      heightScale: 5,
      layerId: "surface",
      maxSamples: 2,
      terrainWidth: 10,
    });
    const caveMesh = createTerrainMeshData(sampleMapData, {
      heightScale: 5,
      layerId: "cave",
      maxSamples: 2,
      terrainWidth: 10,
    });

    expect(caveMesh.layerId).toBe("cave");
    expect(caveMesh.positions).toEqual(surfaceMesh.positions);
    expect(caveMesh.colors[0]).not.toBe(surfaceMesh.colors[0]);
    expect(terrainLayerSceneStyle("cave").backgroundColor).not.toBe(terrainLayerSceneStyle("surface").backgroundColor);
  });

  it("always derives entity elevation from heightMap rather than stored z", () => {
    const meshData = createTerrainMeshData(sampleMapData, {
      heightScale: 5,
      maxSamples: 2,
      terrainWidth: 10,
    });
    const entity: WorldEntity = {
      worldInstanceId: "world-1",
      entityKey: "player",
      entityType: "player",
      layerId: "surface",
      x: 0,
      y: 0,
      z: 0.95,
      homeX: null,
      homeY: null,
      movementCostMultiplier: 1,
      jumpHeight: 1,
      maxSlope: 0.35,
      state: "idle",
      behavior: "manual",
      metadataJson: {},
    };

    const position = entityToTerrainPosition(sampleMapData, entity, meshData, 0.25);

    expect(position.y).toBeCloseTo(meshData.visualHeightMap[0] * 5 + 0.25);
    expect(position.y).not.toBeCloseTo(0.95 * 5 + 0.25);
  });

  it("reports height-diff movement readiness for the current entity tile", () => {
    const entity: WorldEntity = {
      worldInstanceId: "world-1",
      entityKey: "player",
      entityType: "player",
      layerId: "surface",
      x: 0,
      y: 0,
      z: null,
      homeX: null,
      homeY: null,
      movementCostMultiplier: 1,
      jumpHeight: 0.2,
      maxSlope: 0.2,
      state: "idle",
      behavior: "manual",
      metadataJson: {},
    };

    const readiness = heightDiffMovementReadiness(sampleMapData, entity);

    expect(readiness.checkedDirections).toBe(2);
    expect(readiness.reachableDirections).toBe(0);
    expect(readiness.maxAdjacentHeightDiff).toBeCloseTo(0.5);
    expect(readiness.maxSlope).toBeCloseTo(0.2);
  });

  it("uses the same blocked-tile movement rule for 3D readiness as 2D movement", () => {
    const mapData = {
      ...sampleMapData,
      width: 2,
      height: 2,
      heightMap: [0.2, 0.25, 0.25, 0.25],
      terrainMap: ["grass", "grass", "water", "grass"],
      objectList: [],
      collisionMap: [false, false, true, false],
      costMap: [1, 1, 255, 1],
      portalList: [],
    } as const;
    const entity: WorldEntity = {
      worldInstanceId: "world-1",
      entityKey: "player",
      entityType: "player",
      layerId: "surface",
      x: 0,
      y: 0,
      z: null,
      homeX: null,
      homeY: null,
      movementCostMultiplier: 1,
      jumpHeight: 1,
      maxSlope: 1,
      state: "idle",
      behavior: "manual",
      metadataJson: {},
    };

    const readiness = heightDiffMovementReadiness(mapData, entity);

    expect(readiness.checkedDirections).toBe(2);
    expect(readiness.reachableDirections).toBe(1);
  });
});

function maxAdjacentHeightDiff(heightMap: ArrayLike<number>, width: number, height: number): number {
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
