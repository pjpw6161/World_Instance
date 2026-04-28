# World Forge

**World Forge** is a browser-first procedural world platform.

The browser runs a C++/WebAssembly map generation engine. The backend does **not** generate maps in the MVP. It stores map recipes, versions, publish state, world instances, and entity state. PostgreSQL is the source of truth. Elasticsearch is a search/analytics projection for public maps.

## Core idea

Users choose:

- map width/height within allowed limits
- seed
- enabled features: mountains, forests, trees, roads, caves, rivers, villages
- algorithm choices: terrain, cave, road, tree/object placement
- generation parameters: water level, mountain level, forest density, cave density, road complexity
- view mode: 2D terrain, height map, side view, later 3D terrain

The app generates a deterministic map in the browser, lets the user save/publish it, then allows the user to create a **World Instance** where simple entities move around the generated map.

## Target architecture

```txt
Browser
  React + Vite + TypeScript
  C++/WebAssembly map engine
  Canvas 2D renderer
  3D renderer later
  Local draft save
  World Instance simulation client-side

Spring Boot API
  Auth later
  Map project/version save/load
  Publish/private state
  World Instance save/load
  Entity State save/load
  Search API wrapper
  Elasticsearch indexing

PostgreSQL
  Source of truth
  Recipe, stats, map versions, world instances, entity states

Elasticsearch
  Public map search
  Feature/algorithm/stat filters
  Facets/aggregations
  Similar map search via Map DNA vector later
```

## Non-goals for MVP

- no real-time multiplayer
- no server-authoritative monster simulation
- no combat system
- no complex art pipeline
- no full 3D terrain at the start
- no Elasticsearch as the primary database
- no Java server-side map generation for MVP

## Recommended first milestone

Create the skeleton:

```txt
apps/web                 React/Vite frontend
apps/api                 Spring Boot API
packages/shared          TypeScript contracts for frontend/WASM wrapper
engine/wasm-engine       C++/WebAssembly engine
infra/docker-compose.yml PostgreSQL + Elasticsearch
```

Then implement in this order:

1. shared recipe/map contracts
2. WASM engine skeleton and deterministic generation contract
3. 2D/height/side view editor
4. Spring Boot map/version/world-instance API
5. PostgreSQL persistence
6. Elasticsearch public map indexing/search
7. World Instance movement in browser
8. 3D terrain view later

## Phase 0 scaffold

This repository currently contains the Phase 0 project skeleton:

```txt
apps/web                 React + Vite + TypeScript frontend scaffold
apps/api                 Spring Boot + Gradle API scaffold
packages/shared          TypeScript shared package scaffold
engine/wasm-engine       C++/Emscripten engine skeleton
infra/docker-compose.yml PostgreSQL + Elasticsearch development placeholders
```

Phase 0 intentionally does not implement map generation, World Instance behavior, Elasticsearch search, authentication, or 3D rendering.

## Local commands

Install JavaScript workspaces:

```powershell
npm install
```

Run common checks:

```powershell
npm run shared:build
npm run web:build
npm run api:test
npm run infra:config
```

Run the frontend:

```powershell
npm run web:dev
```

Run the API:

```powershell
npm run api:test
cd apps/api
.\gradlew.bat bootRun
```

Check the WASM engine tooling:

```powershell
emcc --version
powershell -ExecutionPolicy Bypass -File engine/wasm-engine/scripts/build-wasm.ps1
```

## Codex workflow

Start by asking Codex to read `AGENTS.md`, `docs/`, and `.agents/skills/`. Then use the prompts in `docs/12_CODEX_PROMPTS.md`.
