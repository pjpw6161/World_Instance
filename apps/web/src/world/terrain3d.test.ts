import { sampleMapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import { createTerrainMeshData, entityToTerrainPosition } from "./terrain3d";
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
      state: "idle",
      behavior: "manual",
      metadataJson: {},
    };

    const position = entityToTerrainPosition(sampleMapData, entity, meshData, 0.25);

    expect(position.x).toBeCloseTo(5);
    expect(position.y).toBeCloseTo(4.75);
    expect(position.z).toBeCloseTo(5);
  });
});
