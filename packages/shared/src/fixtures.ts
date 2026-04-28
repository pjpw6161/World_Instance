import { defaultRecipe } from "./defaults";
import type { EntityStateDto, MapData, MapStats, WorldInstanceDto } from "./types";

export const sampleGenerationRecipe = {
  ...defaultRecipe,
  features: { ...defaultRecipe.features },
  algorithms: { ...defaultRecipe.algorithms },
  params: { ...defaultRecipe.params },
};

export const sampleMapStats: MapStats = {
  waterRatio: 0.25,
  landRatio: 0.75,
  forestRatio: 0.2,
  mountainRatio: 0.1,
  treeCount: 2,
  roadLength: 1,
  caveAreaRatio: 0,
  villageCount: 1,
  blockedRatio: 0.25,
  reachableAreaRatio: 0.75,
  generationTimeMs: 0,
};

export const sampleMapData: MapData = {
  width: 2,
  height: 2,
  heightMap: [0.1, 0.4, 0.6, 0.9],
  terrainMap: ["water", "grass", "forest", "mountain"],
  objectList: [
    {
      id: "object-tree-1",
      type: "tree",
      layerId: "surface",
      x: 1,
      y: 0,
    },
  ],
  collisionMap: [true, false, false, true],
  costMap: [255, 1, 3, 255],
  portalList: [],
  stats: sampleMapStats,
  mapHash: "fixture-map-hash",
};

export const sampleWorldInstance: WorldInstanceDto = {
  id: "world-instance-1",
  ownerId: "dev-user",
  mapVersionId: "map-version-1",
  name: "Sample World",
  worldTime: 0,
  lastSavedAt: "2026-04-28T00:00:00.000Z",
};

export const sampleEntityState: EntityStateDto = {
  id: "entity-state-1",
  worldInstanceId: sampleWorldInstance.id,
  entityKey: "player",
  entityType: "player",
  layerId: "surface",
  x: 1,
  y: 1,
  z: null,
  homeX: null,
  homeY: null,
  state: "idle",
  behavior: "manual",
  metadataJson: {},
};
