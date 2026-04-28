# World Forge WASM Engine

The C++ engine owns deterministic map generation and returns `MapData` as JSON for the first integration pass. It has no React, Canvas, or Spring Boot dependency.

Phase 2 implements the minimum deterministic contract:

- deterministic SplitMix64/FNV-based PRNG helpers
- `heightMap`
- `terrainMap`
- `collisionMap`
- `costMap`
- basic stats
- `mapHash`
- Emscripten build script
- TypeScript wrapper in `engine/wasm-engine/ts`

Roads, objects, caves, rivers, villages, 3D data, and rendering are intentionally not implemented yet.

## Build WASM

```powershell
powershell -ExecutionPolicy Bypass -File engine/wasm-engine/scripts/build-wasm.ps1
```

Output:

```txt
engine/wasm-engine/dist/world_forge_engine.js
engine/wasm-engine/dist/world_forge_engine.wasm
```

The script also copies browser-loadable artifacts to:

```txt
apps/web/public/wasm/world_forge_engine.js
apps/web/public/wasm/world_forge_engine.wasm
```

`apps/web` loads `/wasm/world_forge_engine.js` first. The TypeScript reference module is only a development fallback when the WASM artifact is missing or fails to load.

If Emscripten is not installed or `em++` is not on `PATH`, the build script exits with a clear message.

## Wrapper Checks

```powershell
npm run wasm-wrapper:build
npm run wasm-wrapper:test
```
