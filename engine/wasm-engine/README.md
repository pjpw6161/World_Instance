# World Forge WASM Engine

Phase 0 contains only the C++/Emscripten project skeleton.

The engine must remain independent from React, Canvas, and Spring Boot. Later phases will add deterministic map generation that returns `MapData` through a TypeScript wrapper.

## Local checks

```powershell
emcc --version
cmake -S engine/wasm-engine -B engine/wasm-engine/build
```

If Emscripten is not installed, the build script exits with a clear message.
