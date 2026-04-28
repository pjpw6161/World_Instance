# Frontend Spec

## Framework

- React + Vite + TypeScript

## Main routes

```txt
/                   landing or redirect to editor
/editor             map generation editor
/maps               user's saved maps later
/maps/:id           map detail
/gallery            public searchable maps
/world/:id          World Instance explorer
```

## Editor UI

Left/center:

- 2D terrain canvas
- height map view
- side view
- later 3D terrain view

Right panel:

- width/height selector
- seed input and random seed button
- feature checkboxes
- algorithm selectors
- parameter sliders
- Generate button
- Save button later
- Publish button later

Bottom panel:

- stats
- map hash
- generation time
- active view mode
- warnings/errors

## View modes

### 2D Terrain View

Renders terrainMap/objectMap/collision hints.

### Height Map View

Renders heightMap as grayscale or gradient.

### Side View

Renders selected row/column elevation profile.

### 3D Terrain View

Consumes the same `MapData` and `WorldInstance` entity state. Do not create a separate 3D-only map format.

MVP v0.1 behavior:

- uses `heightMap` for terrain elevation
- uses `terrainMap` for vertex colors
- renders player and entities as simple spheres
- derives entity z position from `heightMap`, not from a separate 3D simulation
- supports 2D/3D switching in `/world/:id`
- supports orbit, top, and side camera presets
- filters entities by the current `layerId`
- treats surface and cave as separate visual scenes backed by the same MapData grid

Performance limits:

- terrain mesh is sampled to a maximum of 96 points per axis by default
- large maps are simplified for preview rather than rendered as full-resolution geometry
- entity and marker meshes are simple primitives only
- no physics engine, skeletal animation, texture streaming, or complex model loading in MVP

## World Instance view

MVP:

- player dot/circle moves with keyboard
- entities move as dots/circles
- collisionMap blocks movement
- costMap influences entity pathfinding
- portalList transitions between surface and cave layers
- save/restore state through API

## Frontend boundaries

- UI components must not contain generation algorithms.
- Renderers must consume MapData only.
- API clients must use typed request/response DTOs.
- Do not call Elasticsearch directly from the browser.
