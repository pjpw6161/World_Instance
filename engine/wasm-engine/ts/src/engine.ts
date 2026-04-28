import { assertValidGenerationRecipe, type GenerationRecipe, type MapData } from "@world-forge/shared";
import type {
  WorldForgeArtifactModuleFactoryOptions,
  WasmEngineStatus,
  WorldForgeLowLevelModule,
  WorldForgeModuleFactory,
  WorldForgeWasmEngine,
  WorldForgeWasmEngineOptions,
} from "./types";

const defaultModuleUrl = "/wasm/world_forge_engine.js";
const defaultWasmUrl = "/wasm/world_forge_engine.wasm";

export function createWorldForgeWasmEngine(options: WorldForgeWasmEngineOptions = {}): WorldForgeWasmEngine {
  let status: WasmEngineStatus = "unloaded";
  let moduleInstance: WorldForgeLowLevelModule | null = null;
  let version: string | null = null;
  const moduleFactory = options.moduleFactory ?? createArtifactModuleFactory({
    moduleUrl: options.moduleUrl,
    wasmUrl: options.wasmUrl,
  });

  return {
    status: () => status,
    engineVersion: () => version,
    async load() {
      if (status === "ready") {
        return;
      }
      status = "loading";
      try {
        moduleInstance = await moduleFactory();
        version = moduleInstance.engine_version?.() ?? null;
        status = "ready";
      } catch (error) {
        status = "error";
        throw error;
      }
    },
    async generate(recipe: GenerationRecipe) {
      const validRecipe = assertValidGenerationRecipe(recipe);
      if (status !== "ready") {
        await this.load();
      }
      if (!moduleInstance) {
        throw new Error("WASM engine module is not loaded");
      }

      const startedAt = nowMs();
      const payload = moduleInstance.generate_map_json(
        validRecipe.engineVersion,
        validRecipe.seed,
        validRecipe.width,
        validRecipe.height,
        validRecipe.features.mountains,
        validRecipe.features.forests,
        validRecipe.features.trees,
        validRecipe.features.roads,
        validRecipe.features.caves,
        validRecipe.features.rivers,
        validRecipe.features.villages,
        validRecipe.algorithms.terrain,
        validRecipe.algorithms.cave,
        validRecipe.algorithms.road,
        validRecipe.algorithms.objectPlacement,
        validRecipe.params.waterLevel,
        validRecipe.params.mountainLevel,
        validRecipe.params.forestDensity,
        validRecipe.params.caveDensity,
        validRecipe.params.roadComplexity,
      );
      const parsed = parseMapData(payload);
      return {
        ...parsed,
        stats: {
          ...parsed.stats,
          generationTimeMs: Math.max(0, nowMs() - startedAt),
        },
      };
    },
    dispose() {
      moduleInstance?.dispose?.();
      moduleInstance = null;
      version = null;
      status = "unloaded";
    },
  };
}

export function createArtifactModuleFactory(
  options: WorldForgeArtifactModuleFactoryOptions = {},
): WorldForgeModuleFactory {
  const moduleUrl = options.moduleUrl ?? defaultModuleUrl;
  const wasmUrl = options.wasmUrl ?? defaultWasmUrl;

  return async () => {
    const moduleFactory = await importArtifactModule(moduleUrl);
    const createModule = moduleFactory.default as WorldForgeModuleFactory;
    return createModule({
      locateFile: (path) => {
        if (path.endsWith(".wasm")) {
          return wasmUrl;
        }
        return path;
      },
    });
  };
}

async function importArtifactModule(moduleUrl: string): Promise<{ default: unknown }> {
  // Keep Vite from transforming files emitted into apps/web/public/wasm.
  const nativeImport = new Function("url", "return import(url)") as (url: string) => Promise<{ default: unknown }>;
  return nativeImport(moduleUrl);
}

function parseMapData(payload: string): MapData {
  const value = JSON.parse(payload) as MapData;
  const tileCount = value.width * value.height;

  if (value.heightMap.length !== tileCount) {
    throw new Error(`heightMap length ${value.heightMap.length} does not match ${tileCount}`);
  }
  if (value.terrainMap.length !== tileCount) {
    throw new Error(`terrainMap length ${value.terrainMap.length} does not match ${tileCount}`);
  }
  if (value.collisionMap.length !== tileCount) {
    throw new Error(`collisionMap length ${value.collisionMap.length} does not match ${tileCount}`);
  }
  if (value.costMap.length !== tileCount) {
    throw new Error(`costMap length ${value.costMap.length} does not match ${tileCount}`);
  }
  if (typeof value.mapHash !== "string" || value.mapHash.length === 0) {
    throw new Error("mapHash is required");
  }

  return value;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
