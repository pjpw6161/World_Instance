# WASM Interface

## Goal

Expose a stable TypeScript wrapper around the C++/WebAssembly engine.

Frontend code must call the wrapper, not low-level Emscripten APIs directly.

## Suggested TypeScript API

```ts
export type WasmEngineStatus = "unloaded" | "loading" | "ready" | "error";

export interface WorldForgeWasmEngine {
  status(): WasmEngineStatus;
  load(): Promise<void>;
  generate(recipe: GenerationRecipe): Promise<MapData>;
  dispose(): void;
}
```

## Data transfer

MVP may use JSON for ease of integration. Later, use binary buffers for performance.

Recommended progression:

1. JSON request/response for first integration
2. typed arrays for `heightMap`, `terrainMap`, `collisionMap`, `costMap`
3. binary serialization for large maps

## Constraints

- Wrapper validates recipe before calling WASM.
- Wrapper never draws directly.
- Wrapper returns MapData only.
- Wrapper exposes engineVersion.
- Wrapper reports generationTimeMs.

## Determinism tests

Required:

- same recipe -> same mapHash
- different seed -> different mapHash usually
- disabled feature -> no corresponding output
- invalid width/height -> rejected
