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
- view mode: 2D terrain, height map, side view, and basic 3D terrain preview

The app generates a deterministic map in the browser. The API stores map projects, versions, publish state, and **World Instance** snapshots where simple entities move around the generated map. Public maps can be forked into a signed-in user's private library before opening them as World Instances.

## Target architecture

```txt
Browser
  React + Vite + TypeScript
  C++/WebAssembly map engine
  Canvas 2D renderer
  Basic 3D terrain preview
  Local draft save
  World Instance simulation client-side

Spring Boot API
  Email/password auth + JWT bearer tokens
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
  Similar map search via Map DNA/stat distance
```

## Non-goals for MVP

- no real-time multiplayer
- no server-authoritative monster simulation
- no combat system
- no complex art pipeline
- no production-grade 3D game renderer
- no Elasticsearch as the primary database
- no Java server-side map generation for MVP

## Current MVP v0.1 scope

This repository currently contains:

```txt
apps/web                 React/Vite frontend with editor, 2D/height/side views, World Instance view, and basic 3D preview
apps/api                 Spring Boot API for maps, versions, world instances, public search, and admin reindex
packages/shared          TypeScript contracts and validation helpers
engine/wasm-engine       C++/WebAssembly deterministic map engine plus TypeScript wrapper
infra/docker-compose.yml PostgreSQL + Elasticsearch for local development
```

Map generation must be produced by the browser WASM artifact for release usage. The TypeScript deterministic generator exists only as a clearly labeled development/test fallback.

## Clean Clone Setup

Install JavaScript workspaces:

```powershell
npm install
```

Start PostgreSQL and Elasticsearch:

```powershell
docker compose -f infra/docker-compose.yml up -d postgres elasticsearch
docker compose -f infra/docker-compose.yml ps
```

Local schema setup is handled by Flyway migrations with `WORLD_FORGE_JPA_DDL_AUTO=validate` by default. Start PostgreSQL before booting the API so Flyway can create the MVP tables.

Build the TypeScript packages and the WASM wrapper:

```powershell
npm run shared:build
npm run wasm-wrapper:build
```

Build the real browser WASM artifact. Emscripten must be installed and activated so `em++` is on `PATH`.

```powershell
npm run wasm:build
```

The WASM build emits `engine/wasm-engine/dist/world_forge_engine.js` and `.wasm`, then copies them to `apps/web/public/wasm/` for Vite to serve. These generated artifacts are intentionally ignored by git and must be rebuilt after a clean clone.

Run the API:

```powershell
cd apps/api
.\gradlew.bat bootRun
```

Create a local user and token before calling protected map/world endpoints:

```powershell
$signup = Invoke-RestMethod -Method Post "http://localhost:8080/api/auth/signup" -ContentType "application/json" -Body (@{
  email = "dev@example.com"
  password = "Password123!"
  nickname = "Dev User"
} | ConvertTo-Json)

$headers = @{ Authorization = "Bearer $($signup.token)" }
Invoke-RestMethod "http://localhost:8080/api/me" -Headers $headers
```

Run the frontend in another terminal:

```powershell
npm run web:dev
```

Open the Vite URL, then use `/editor`. If the WASM artifact is missing in development, the editor labels the engine as `Fallback`; production builds fail generation instead of silently using the fallback.

## Local Checks

Run common checks from the repository root:

```powershell
npm run shared:build
npm run shared:test
npm run wasm-wrapper:build
npm run wasm-wrapper:test
npm run web:build
npm run web:test
npm run api:test
npm run infra:config
```

Run the complete verification bundle:

```powershell
npm run verify
```

Run release verification, including the real Emscripten WASM artifact and API build:

```powershell
npm run verify:release
```

Rebuild the search index from PostgreSQL public maps:

```powershell
$env:WORLD_FORGE_ADMIN_ENABLED="true"
$env:WORLD_FORGE_ADMIN_TOKEN="local-admin-token"
cd apps/api
.\gradlew.bat bootRun
```

Then call:

```powershell
Invoke-RestMethod -Method Post http://localhost:8080/api/admin/search/maps/reindex -Headers @{
  "X-World-Forge-Admin-Token" = "local-admin-token"
}
```

## Codex workflow

Start by asking Codex to read `AGENTS.md`, `docs/`, and `.agents/skills/`. Then use the prompts in `docs/12_CODEX_PROMPTS.md`.
