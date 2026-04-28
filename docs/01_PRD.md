# Product Requirements Document

## Product name

World Forge

## Goal

Allow users to create, save, explore, publish, search, and lightly simulate their own procedural maps.

## User value

Users should feel that they own a small generated world. They can choose the map's rules, generate variations, inspect it in multiple views, save it, publish it, and later watch small entities move around it.

## Primary user flows

### Flow 1: Generate map

1. User opens `/editor`.
2. User chooses map size, seed, features, algorithms, and parameters.
3. Browser loads the WASM engine.
4. Browser generates `MapData`.
5. Frontend renders 2D terrain, height map, and side view.
6. User adjusts parameters and regenerates.

### Flow 2: Save map

1. User clicks Save.
2. Browser sends recipe, stats, mapHash, and optional thumbnail to API.
3. API validates size/params/features.
4. API stores project/version in PostgreSQL.

### Flow 3: Publish map

1. User marks a saved map as public.
2. API validates ownership and publish state.
3. API indexes a search document into Elasticsearch.
4. Public map becomes searchable.

### Flow 4: Search maps

1. User opens Gallery.
2. User searches by keyword, feature, algorithm, size, or stats.
3. API translates safe DTO into Elasticsearch query.
4. UI displays results and facets.

### Flow 5: Create World Instance

1. User opens a saved map.
2. User creates a World Instance.
3. Browser regenerates map from recipe and starts local simulation.
4. Player/entity dots move around 2D map.
5. State can be saved and restored.

## MVP features

- map size selection with min/max
- seed-based deterministic generation
- feature flags
- algorithm selection
- 2D terrain view
- height map view
- side view
- save/load map recipe and stats
- publish/private state
- basic public search
- basic World Instance state model

## Later features

- 3D terrain view
- living entities on 3D terrain
- cave layer transitions
- map DNA vector similar search
- facet aggregations
- fork/remix
- version compare
- server-side WASM validation
- PNG/JSON export storage

## Non-goals

- MMO
- real-time multiplayer
- combat
- complex art assets
- server-side live simulation
- manual content-heavy map design
