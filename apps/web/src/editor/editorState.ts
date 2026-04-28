import {
  CAVE_ALGORITHMS,
  FEATURE_KEYS,
  GENERATION_PARAM_LIMITS,
  MAP_SIZE_LIMITS,
  OBJECT_PLACEMENT_ALGORITHMS,
  ROAD_ALGORITHMS,
  SEED_LIMITS,
  TERRAIN_ALGORITHMS,
  defaultRecipe,
  type AlgorithmSelection,
  type FeatureKey,
  type GenerationParams,
  type GenerationRecipe,
  type ViewMode,
} from "@world-forge/shared";

export const sizeOptions = [64, 128, 256, 512] as const;

export const viewModes: readonly { value: ViewMode; label: string }[] = [
  { value: "terrain-2d", label: "Terrain" },
  { value: "height-map", label: "Height" },
  { value: "side-view", label: "Side" },
];

export const featureOptions: readonly { key: FeatureKey; label: string }[] = FEATURE_KEYS.map((key) => ({
  key,
  label: toTitle(key),
}));

export const algorithmOptions = {
  terrain: TERRAIN_ALGORITHMS,
  cave: CAVE_ALGORITHMS,
  road: ROAD_ALGORITHMS,
  objectPlacement: OBJECT_PLACEMENT_ALGORITHMS,
} as const;

export const paramOptions: readonly {
  key: keyof GenerationParams;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "waterLevel", label: "Water", min: 0, max: 1, step: 0.01 },
  { key: "mountainLevel", label: "Mountain", min: 0, max: 1, step: 0.01 },
  { key: "forestDensity", label: "Forest", min: 0, max: 1, step: 0.01 },
  { key: "caveDensity", label: "Cave", min: 0, max: 1, step: 0.01 },
  { key: "roadComplexity", label: "Road", min: 0, max: 1, step: 0.01 },
];

export function createInitialRecipe(): GenerationRecipe {
  return cloneRecipe(defaultRecipe);
}

export function cloneRecipe(recipe: GenerationRecipe): GenerationRecipe {
  return {
    ...recipe,
    features: { ...recipe.features },
    algorithms: { ...recipe.algorithms },
    params: { ...recipe.params },
  };
}

export function withMapSize(recipe: GenerationRecipe, width: number, height: number): GenerationRecipe {
  return {
    ...recipe,
    width: clampInteger(width, MAP_SIZE_LIMITS.min, MAP_SIZE_LIMITS.max),
    height: clampInteger(height, MAP_SIZE_LIMITS.min, MAP_SIZE_LIMITS.max),
  };
}

export function withSeed(recipe: GenerationRecipe, seed: number): GenerationRecipe {
  return {
    ...recipe,
    seed: clampInteger(seed, SEED_LIMITS.min, SEED_LIMITS.max),
  };
}

export function withFeature(recipe: GenerationRecipe, key: FeatureKey, enabled: boolean): GenerationRecipe {
  return {
    ...recipe,
    features: {
      ...recipe.features,
      [key]: enabled,
    },
  };
}

export function withAlgorithm<K extends keyof AlgorithmSelection>(
  recipe: GenerationRecipe,
  key: K,
  value: AlgorithmSelection[K],
): GenerationRecipe {
  return {
    ...recipe,
    algorithms: {
      ...recipe.algorithms,
      [key]: value,
    },
  };
}

export function withParam(recipe: GenerationRecipe, key: keyof GenerationParams, value: number): GenerationRecipe {
  const limits = GENERATION_PARAM_LIMITS[key];
  return {
    ...recipe,
    params: {
      ...recipe.params,
      [key]: clampNumber(value, limits.min, limits.max),
    },
  };
}

export function createRandomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? defaultRecipe.seed;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatParam(value: number): string {
  return value.toFixed(2);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function toTitle(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
