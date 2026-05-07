import { describe, expect, it } from "vitest";
import { sampleMapData } from "@world-forge/shared";
import type { MapData, TerrainType } from "@world-forge/shared";
import type { WorldEntity } from "./worldState";
import { createWorldIdentity } from "./worldIdentity";
import { hitTestWorldMapAnnotation, isShorelineTile, roadConnections, styledTileSize } from "./worldMapRenderer";

describe("world map renderer helpers", () => {
  it("chooses a readable styled tile size for common map dimensions", () => {
    expect(styledTileSize(mapShell(64, 64))).toBe(10);
    expect(styledTileSize(mapShell(256, 256))).toBe(5);
    expect(styledTileSize(mapShell(512, 512))).toBe(2);
  });

  it("detects land tiles that need a sand shoreline band", () => {
    const mapData = mapWithTerrain(3, 3, [
      "grass", "water", "grass",
      "grass", "grass", "grass",
      "grass", "forest", "mountain",
    ]);

    expect(isShorelineTile(mapData, 1, 1)).toBe(true);
    expect(isShorelineTile(mapData, 1, 0)).toBe(false);
    expect(isShorelineTile(mapData, 2, 2)).toBe(false);
  });

  it("finds connected road neighbors for path-style drawing", () => {
    const mapData = mapWithTerrain(3, 3, [
      "grass", "road", "grass",
      "road", "road", "road",
      "grass", "road", "grass",
    ]);

    expect(roadConnections(mapData, 1, 1)).toEqual({
      north: true,
      south: true,
      west: true,
      east: true,
    });
    expect(roadConnections(mapData, 1, 0)).toEqual({
      north: false,
      south: true,
      west: false,
      east: false,
    });
  });

  it("hit-tests styled atlas pins for tooltips", () => {
    const identity = createWorldIdentity(sampleMapData, [entityAt("player", "player", 1, 0)], {
      worldInstanceId: "world-1",
      worldName: "Tooltip World",
    });

    const hit = hitTestWorldMapAnnotation(sampleMapData, "surface", identity, 35, 157);

    expect(hit?.label).toBe("던전 코어");
  });
});

function mapShell(width: number, height: number): Pick<MapData, "width" | "height"> {
  return { width, height };
}

function entityAt(entityKey: string, entityType: WorldEntity["entityType"], x: number, y: number): WorldEntity {
  return {
    worldInstanceId: "world-1",
    entityKey,
    entityType,
    layerId: "surface",
    x,
    y,
    z: null,
    homeX: x,
    homeY: y,
    movementCostMultiplier: 1,
    jumpHeight: 1,
    maxSlope: 0.35,
    state: "idle",
    behavior: entityType === "player" ? "manual" : "wander",
    metadataJson: {},
  };
}

function mapWithTerrain(width: number, height: number, terrainMap: TerrainType[]): MapData {
  return {
    width,
    height,
    heightMap: new Array(width * height).fill(0.4),
    terrainMap,
    objectList: [],
    collisionMap: new Array(width * height).fill(false),
    costMap: new Array(width * height).fill(1),
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
    mapHash: "test-map",
  };
}
