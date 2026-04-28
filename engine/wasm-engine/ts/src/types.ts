import type { GenerationRecipe, MapData } from "@world-forge/shared";

export type WasmEngineStatus = "unloaded" | "loading" | "ready" | "error";

export interface WorldForgeWasmEngine {
  status(): WasmEngineStatus;
  engineVersion(): string | null;
  load(): Promise<void>;
  generate(recipe: GenerationRecipe): Promise<MapData>;
  dispose(): void;
}

export interface WorldForgeLowLevelModule {
  engine_version?: () => string;
  generate_map_json: (
    engineVersion: string,
    seed: number,
    width: number,
    height: number,
    featureMountains: boolean,
    featureForests: boolean,
    featureTrees: boolean,
    featureRoads: boolean,
    featureCaves: boolean,
    featureRivers: boolean,
    featureVillages: boolean,
    terrainAlgorithm: string,
    caveAlgorithm: string,
    roadAlgorithm: string,
    objectPlacementAlgorithm: string,
    waterLevel: number,
    mountainLevel: number,
    forestDensity: number,
    caveDensity: number,
    roadComplexity: number,
  ) => string;
  dispose?: () => void;
}

export type WorldForgeModuleFactory = () => Promise<WorldForgeLowLevelModule>;

export interface WorldForgeWasmEngineOptions {
  moduleFactory?: WorldForgeModuleFactory;
}
