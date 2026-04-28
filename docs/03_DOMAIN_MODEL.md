# Domain Model

## Core concepts

### GenerationRecipe

The complete user-selected generation input.

Fields:

- engineVersion
- seed
- width
- height
- features
- algorithms
- params

### MapData

The deterministic generated output consumed by renderers and simulation.

Fields:

- width
- height
- heightMap
- terrainMap
- biomeMap optional
- objectMap/list
- collisionMap
- costMap
- portalMap
- stats
- mapHash

### MapProject

A user-owned map container.

Fields:

- id
- ownerId
- title
- description
- visibility
- currentVersionId

### MapVersion

A saved generated map version.

Fields:

- projectId
- engineVersion
- seed
- width
- height
- recipeJson
- statsJson
- mapHash
- thumbnailUrl optional

### WorldInstance

A personal playable/explorable state created from a MapVersion.

Fields:

- id
- ownerId
- mapVersionId
- name
- worldTime
- lastSavedAt

### EntityState

A stored entity/player/creature state for a WorldInstance.

Fields:

- id
- worldInstanceId
- entityType
- layerId
- x
- y
- z
- homeX/homeY optional
- state
- behavior
- metadataJson

## Feature flags

MVP:

- mountains
- forests
- trees
- roads
- caves
- rivers
- villages

Feature flags control whether a layer/object generator may run. If disabled, the output must not contain that feature.

## Algorithm selection

MVP options can start small:

```txt
terrain: noise-island | radial-island
cave: cellular-automata | random-walk
road: astar | simple-path
objectPlacement: biome-density | scatter
```

The UI should allow algorithm selection even if some algorithms are marked experimental.

## Map layers

```txt
heightMap     Float or fixed-point elevation
terrainMap    tile terrain type
biomeMap      optional biome classification
objectMap     trees, rocks, cave entrances, villages
collisionMap  passable/blocked
costMap       movement cost for pathfinding
portalMap     cave entrance/exit or layer transition
```

## Layer IDs

- `surface`
- `cave:<id>` later

MVP may store only `surface` and a placeholder for cave layers.
