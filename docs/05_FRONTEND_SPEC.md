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

### 3D Terrain View later

Consumes the same MapData. Do not create a separate 3D-only map format.

## World Instance view

MVP:

- player dot/circle moves with keyboard
- entities move as dots/circles
- collisionMap blocks movement
- costMap influences entity pathfinding
- portalMap can transition to cave layer later
- save/restore state through API

## Frontend boundaries

- UI components must not contain generation algorithms.
- Renderers must consume MapData only.
- API clients must use typed request/response DTOs.
- Do not call Elasticsearch directly from the browser.
