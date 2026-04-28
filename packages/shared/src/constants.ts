export const WORLD_FORGE_SHARED_VERSION = "0.1.0";
export const DEFAULT_ENGINE_VERSION = "0.1.0";

export const MAP_SIZE_LIMITS = {
  min: 64,
  max: 512,
} as const;

export const SEED_LIMITS = {
  min: 0,
  max: 4_294_967_295,
} as const;

export const FEATURE_KEYS = [
  "mountains",
  "forests",
  "trees",
  "roads",
  "caves",
  "rivers",
  "villages",
] as const;

export const TERRAIN_ALGORITHMS = ["noise-island", "radial-island"] as const;
export const CAVE_ALGORITHMS = ["cellular-automata", "random-walk"] as const;
export const ROAD_ALGORITHMS = ["astar", "simple-path"] as const;
export const OBJECT_PLACEMENT_ALGORITHMS = ["biome-density", "scatter"] as const;

export const GENERATION_PARAM_LIMITS = {
  waterLevel: { min: 0, max: 1 },
  mountainLevel: { min: 0, max: 1 },
  forestDensity: { min: 0, max: 1 },
  caveDensity: { min: 0, max: 1 },
  roadComplexity: { min: 0, max: 1 },
} as const;
