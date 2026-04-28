import type {
  CAVE_ALGORITHMS,
  FEATURE_KEYS,
  OBJECT_PLACEMENT_ALGORITHMS,
  ROAD_ALGORITHMS,
  TERRAIN_ALGORITHMS,
} from "./constants";

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type TerrainAlgorithm = (typeof TERRAIN_ALGORITHMS)[number];
export type CaveAlgorithm = (typeof CAVE_ALGORITHMS)[number];
export type RoadAlgorithm = (typeof ROAD_ALGORITHMS)[number];
export type ObjectPlacementAlgorithm = (typeof OBJECT_PLACEMENT_ALGORITHMS)[number];

export interface EnabledFeatures {
  mountains: boolean;
  forests: boolean;
  trees: boolean;
  roads: boolean;
  caves: boolean;
  rivers: boolean;
  villages: boolean;
}

export interface AlgorithmSelection {
  terrain: TerrainAlgorithm;
  cave: CaveAlgorithm;
  road: RoadAlgorithm;
  objectPlacement: ObjectPlacementAlgorithm;
}

export interface GenerationParams {
  waterLevel: number;
  mountainLevel: number;
  forestDensity: number;
  caveDensity: number;
  roadComplexity: number;
}

export interface GenerationRecipe {
  engineVersion: string;
  seed: number;
  width: number;
  height: number;
  features: EnabledFeatures;
  algorithms: AlgorithmSelection;
  params: GenerationParams;
}

export type TerrainType =
  | "deep-water"
  | "water"
  | "sand"
  | "grass"
  | "forest"
  | "mountain"
  | "road"
  | "cave-floor"
  | "cave-wall";

export type ObjectType = "tree" | "rock" | "cave-entrance" | "village" | "road-node";

export type ViewMode = "terrain-2d" | "height-map" | "side-view";

export interface MapObject {
  id: string;
  type: ObjectType;
  layerId: string;
  x: number;
  y: number;
}

export interface Portal {
  id: string;
  fromLayerId: string;
  toLayerId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

export interface MapStats {
  waterRatio: number;
  landRatio: number;
  forestRatio: number;
  mountainRatio: number;
  treeCount: number;
  roadLength: number;
  caveAreaRatio: number;
  villageCount: number;
  blockedRatio: number;
  reachableAreaRatio?: number;
  generationTimeMs: number;
}

export interface MapData {
  width: number;
  height: number;
  heightMap: readonly number[];
  terrainMap: readonly TerrainType[];
  biomeMap?: readonly string[];
  objectList: readonly MapObject[];
  collisionMap: readonly boolean[];
  costMap: readonly number[];
  portalList: readonly Portal[];
  stats: MapStats;
  mapHash: string;
}

export type EntityType = "player" | "creature" | "npc";

export interface WorldInstanceDto {
  id: string;
  ownerId: string;
  mapVersionId: string;
  name: string;
  worldTime: number;
  lastSavedAt: string;
}

export type WorldInstanceDTO = WorldInstanceDto;

export interface EntityStateDto {
  id: string;
  worldInstanceId: string;
  entityKey: string;
  entityType: EntityType;
  layerId: string;
  x: number;
  y: number;
  z?: number | null;
  homeX?: number | null;
  homeY?: number | null;
  state: string;
  behavior: string;
  metadataJson: Record<string, unknown>;
}

export type EntityStateDTO = EntityStateDto;
