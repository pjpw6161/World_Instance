# AGENTS.md — World Forge

This repository is for **World Forge**, a browser-first procedural world platform.

## Architecture rules

1. **Map generation runs in the browser through C++/WebAssembly.**
   - Spring Boot must not become the primary map generation engine in the MVP.
   - TypeScript mock generation is allowed only as a temporary test/dev fallback and must be clearly labeled.

2. **Spring Boot is a service/data server, not a real-time game server.**
   - It manages users, map projects, map versions, publish state, world instances, entity state, search, and indexing.
   - It must not run continuous monster/entity simulation ticks.

3. **PostgreSQL is the source of truth.**
   - Store recipes, stats, map hashes, versions, world instances, and entity states.
   - Do not store primary data only in Elasticsearch.

4. **Elasticsearch is a search/analytics projection.**
   - Index only public/searchable map documents.
   - Do not accept raw Elasticsearch Query DSL from clients.
   - Use safe search request DTOs and translate them server-side.

5. **Generation and rendering are separate.**
   - The engine outputs `MapData`.
   - Renderers consume `MapData`.
   - Algorithms must not draw directly to Canvas/WebGL.

6. **2D and 3D share the same map data.**
   - `heightMap`, `terrainMap`, `collisionMap`, `costMap`, `portalMap`, and entity state must be view-independent.

7. **World Instance simulation is client-side for MVP.**
   - Player/entity movement runs in the browser.
   - The server stores and restores snapshots/state.
   - No combat, no real-time authoritative backend, no MMO assumptions.

## Expected repo layout

```txt
apps/web/                 React + Vite + TypeScript frontend
apps/api/                 Spring Boot API service
packages/shared/          TypeScript shared contracts and validation helpers
engine/wasm-engine/       C++/Emscripten WebAssembly map engine
infra/                    Docker Compose, PostgreSQL, Elasticsearch config
docs/                     Product, architecture, specs, roadmap, ADRs
.agents/skills/           Codex repo skills
```

## Tech choices

- Frontend: React + Vite + TypeScript
- Rendering: Canvas 2D first; 3D later via a dedicated renderer
- Map engine: C++17 compiled to WebAssembly via Emscripten
- Backend: Java 21 preferred, Spring Boot, Gradle
- Persistence: PostgreSQL
- Search: Elasticsearch
- Object storage: optional later for thumbnails/exports

## Done means

For every implementation task:

- tests exist or the absence of tests is explicitly justified
- deterministic generation is not broken
- `Math.random()` is not used for generation or entity placement
- code respects generation/rendering/server boundaries
- build/test commands are reported at the end
- changed files are summarized

## Safety and scope

Codex must ask for a plan before large rewrites. For this project, prefer small phases and commit-sized changes.

Do not silently introduce:

- Node/NestJS backend
- Prisma
- MongoDB
- server-side real-time entity simulation
- raw Elasticsearch query passthrough
- full 3D terrain before 2D/height/side views are stable
