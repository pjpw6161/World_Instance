import { DEFAULT_ENGINE_VERSION } from "./constants";
import type { AlgorithmSelection, EnabledFeatures, GenerationParams, GenerationRecipe } from "./types";

export const defaultEnabledFeatures: EnabledFeatures = {
  mountains: true,
  forests: true,
  trees: true,
  roads: true,
  caves: false,
  rivers: false,
  villages: true,
};

export const defaultAlgorithms: AlgorithmSelection = {
  terrain: "noise-island",
  cave: "cellular-automata",
  road: "astar",
  objectPlacement: "biome-density",
};

export const defaultParams: GenerationParams = {
  waterLevel: 0.38,
  mountainLevel: 0.72,
  forestDensity: 0.55,
  caveDensity: 0.42,
  roadComplexity: 0.4,
};

export const defaultRecipe: GenerationRecipe = {
  engineVersion: DEFAULT_ENGINE_VERSION,
  seed: 12345,
  width: 256,
  height: 256,
  features: defaultEnabledFeatures,
  algorithms: defaultAlgorithms,
  params: defaultParams,
};
