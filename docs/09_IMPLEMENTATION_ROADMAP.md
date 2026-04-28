# Implementation Roadmap

## Phase 0 — Fresh scaffold

- create repo structure
- create React/Vite app in `apps/web`
- create Spring Boot app in `apps/api`
- create `packages/shared`
- create `engine/wasm-engine`
- create `infra/docker-compose.yml` with PostgreSQL and Elasticsearch placeholders
- create root scripts/docs

No feature implementation yet.

## Phase 1 — Shared contracts

- GenerationRecipe
- EnabledFeatures
- AlgorithmSelection
- GenerationParams
- MapData
- MapStats
- WorldInstance DTOs
- validation helpers
- sample fixtures

## Phase 2 — WASM engine skeleton

- C++ engine project
- deterministic PRNG
- minimal heightMap generation
- terrain classification
- stats
- mapHash
- Emscripten build script
- TypeScript wrapper

## Phase 3 — Frontend editor MVP

- `/editor`
- width/height/seed
- feature checkboxes
- algorithm selectors
- parameter sliders
- generate button
- 2D terrain view
- height map view
- side view
- stats panel

## Phase 4 — Spring Boot persistence MVP

- health endpoint
- PostgreSQL config
- map_projects and map_versions
- save/load APIs
- dev user strategy
- validation

## Phase 5 — World Instance MVP

- collisionMap/costMap in MapData
- 2D player dot movement
- entity dot wander
- state save/load APIs
- no server-side simulation ticks

## Phase 6 — Elasticsearch public search

- Elasticsearch Docker config
- map search document
- publish/unpublish indexing
- safe search API
- filters and facets

## Phase 7 — Advanced map features

- cave layers/portals
- better pathfinding
- livingStats
- Map DNA
- similar search

## Phase 8 — 3D terrain

- heightMap mesh renderer
- top/side/isometric/free camera
- simple sphere entities
- slope/jump movement constraints

## Phase 9 — Hardening

- auth
- ownership rules
- server-side WASM validation optional
- thumbnail storage
- export PNG/JSON
- production deployment docs
