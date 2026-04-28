# Start Here

Read this first when starting the repository.

## Product in one sentence

World Forge lets users generate deterministic procedural maps in the browser using C++/WebAssembly, save and publish those maps through Spring Boot, search public maps through Elasticsearch, and create a lightweight personal World Instance where simple entities move around the generated map.

## Required boundaries

```txt
WASM engine       Generates MapData in the browser.
Frontend          Edits recipes, renders maps, runs lightweight world simulation.
Spring Boot API   Saves data, validates DTOs, manages publish state, exposes search.
PostgreSQL        Source of truth for recipes, versions, instances, entity states.
Elasticsearch     Search/analytics projection for public maps.
```

## First implementation target

Do not start with 3D, search, or world simulation.

Start with:

```txt
1. repo skeleton
2. shared recipe/map contracts
3. WASM engine skeleton
4. frontend editor showing 2D terrain, height map, side view
5. Spring Boot save/load API
```

## What to avoid

- building a game before building the generator
- adding combat systems
- making Spring Boot generate maps for MVP
- using Elasticsearch as the primary DB
- storing the full tile grid everywhere when recipe + seed + engineVersion is enough
