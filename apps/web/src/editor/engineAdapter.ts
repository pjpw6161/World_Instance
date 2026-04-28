import { createDeterministicDevModule, createWorldForgeWasmEngine } from "@world-forge/wasm-engine";

// Temporary dev adapter until an Emscripten artifact is available in engine/wasm-engine/dist.
export function createEditorEngine() {
  return createWorldForgeWasmEngine({
    moduleFactory: async () => createDeterministicDevModule(),
  });
}
