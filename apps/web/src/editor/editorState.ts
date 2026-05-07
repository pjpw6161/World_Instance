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
import { featureLabel } from "../i18n/korean";

export const sizeOptions = [64, 128, 256, 512] as const;

export const viewModes: readonly { value: ViewMode; label: string }[] = [
  { value: "terrain-2d", label: "대지 지도" },
  { value: "height-map", label: "고도 지도" },
  { value: "side-view", label: "단면도" },
];

export const featureOptions: readonly { key: FeatureKey; label: string }[] = FEATURE_KEYS.map((key) => ({
  key,
  label: featureLabel(key),
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
  { key: "waterLevel", label: "수위", min: 0, max: 1, step: 0.01 },
  { key: "mountainLevel", label: "산세", min: 0, max: 1, step: 0.01 },
  { key: "forestDensity", label: "숲 밀도", min: 0, max: 1, step: 0.01 },
  { key: "caveDensity", label: "동굴 밀도", min: 0, max: 1, step: 0.01 },
  { key: "roadComplexity", label: "길 복잡도", min: 0, max: 1, step: 0.01 },
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
