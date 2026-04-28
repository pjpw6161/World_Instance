import { sampleMapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import {
  createTerrainMeshData,
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
    expect(meshData.positions[1]).toBeCloseTo(0.5);
    expect(meshData.positions[10]).toBeCloseTo(4.5);
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
    expect(position.y).toBeCloseTo(4.75);
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
    expect(position.y).toBeCloseTo(4.75);
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

    expect(position.y).toBeCloseTo(0.75);
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
