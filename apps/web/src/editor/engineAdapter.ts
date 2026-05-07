import { createDeterministicDevModule, createWorldForgeWasmEngine } from "@world-forge/wasm-engine";
import type { GenerationRecipe, MapData } from "@world-forge/shared";
import type { WasmEngineStatus, WorldForgeWasmEngine } from "@world-forge/wasm-engine";

export type EditorEngineRuntimeKind = "wasm" | "fallback";

export interface EditorEngineRuntime {
  kind: EditorEngineRuntimeKind;
  label: string;
  detail: string;
}

export interface EditorEngine extends WorldForgeWasmEngine {
  runtime(): EditorEngineRuntime;
  lastLoadError(): string | null;
}

interface EditorEngineOptions {
  wasmModuleUrl?: string;
  wasmBinaryUrl?: string;
  allowFallback?: boolean;
  onRuntimeChange?: (runtime: EditorEngineRuntime) => void;
}

const wasmAssetVersion = import.meta.env.VITE_WASM_ASSET_VERSION ?? "2026-04-30-algorithm-visibility";

function versionedWasmAsset(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(wasmAssetVersion)}`;
}

const wasmRuntime: EditorEngineRuntime = {
  kind: "wasm",
  label: "WASM",
  detail: versionedWasmAsset("/wasm/world_forge_engine.wasm"),
};

function fallbackRuntime(reason: string): EditorEngineRuntime {
  return {
    kind: "fallback",
    label: "Fallback",
    detail: reason,
  };
}

export function createEditorEngine(options: EditorEngineOptions = {}): EditorEngine {
  const allowFallback = options.allowFallback ?? import.meta.env.DEV;
  const moduleUrl = options.wasmModuleUrl ?? versionedWasmAsset("/wasm/world_forge_engine.js");
  const wasmUrl = options.wasmBinaryUrl ?? versionedWasmAsset("/wasm/world_forge_engine.wasm");
  const wasmEngine = createWorldForgeWasmEngine({
    moduleUrl,
    wasmUrl,
  });
  const fallbackEngine = createWorldForgeWasmEngine({
    moduleFactory: async () => createDeterministicDevModule(),
  });

  let activeEngine: WorldForgeWasmEngine = wasmEngine;
  let runtimeValue = wasmRuntime;
  let loadError: string | null = null;

  function setRuntime(runtime: EditorEngineRuntime): void {
    runtimeValue = runtime;
    options.onRuntimeChange?.(runtimeValue);
  }

  async function loadWithFallback(): Promise<void> {
    if (runtimeValue.kind === "fallback") {
      await fallbackEngine.load();
      return;
    }

    try {
      await wasmEngine.load();
      activeEngine = wasmEngine;
      loadError = null;
      setRuntime(wasmRuntime);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "WASM artifact failed to load";
      if (!allowFallback) {
        setRuntime({
          kind: "wasm",
          label: "WASM unavailable",
          detail: loadError,
        });
        throw new Error(
          `WASM engine failed to load from ${moduleUrl}. Run npm run wasm:build before starting the frontend. ${loadError}`,
          { cause: error },
        );
      }
      activeEngine = fallbackEngine;
      setRuntime(fallbackRuntime(loadError));
      await fallbackEngine.load();
    }
  }

  return {
    status(): WasmEngineStatus {
      return activeEngine.status();
    },
    engineVersion(): string | null {
      return activeEngine.engineVersion();
    },
    async load(): Promise<void> {
      await loadWithFallback();
    },
    async generate(recipe: GenerationRecipe): Promise<MapData> {
      if (activeEngine.status() !== "ready") {
        await loadWithFallback();
      }
      return activeEngine.generate(recipe);
    },
    dispose(): void {
      wasmEngine.dispose();
      fallbackEngine.dispose();
      activeEngine = wasmEngine;
      loadError = null;
      runtimeValue = wasmRuntime;
    },
    runtime(): EditorEngineRuntime {
      return runtimeValue;
    },
    lastLoadError(): string | null {
      return loadError;
    },
  };
}
