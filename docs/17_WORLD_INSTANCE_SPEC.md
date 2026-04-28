# World Instance Spec

## Goal

Turn a generated map into a personal living world where player/entity dots move around the map.

## MVP behavior

- user creates a World Instance from a MapVersion
- browser regenerates MapData from recipe
- player dot moves on 2D map using keyboard
- simple entities wander
- collisionMap blocks movement
- costMap influences movement/pathfinding later
- state can be saved and loaded

## Non-goals

- combat
- real-time multiplayer
- server-authoritative simulation
- complex art assets
- inventory, quests, economy

## Movement rules

2D MVP:

- water blocked
- tree object blocked
- cave wall blocked
- road low cost
- forest higher cost
- cave entrance portal later

3D later:

- z comes from heightMap
- height difference controls passability
- entity jumpHeight controls allowable height change
- renderer may animate a simple jump arc

## Data model

```txt
WorldInstance
- id
- ownerId
- mapVersionId
- name
- worldTime
- lastSavedAt

EntityState
- id
- worldInstanceId
- entityKey
- entityType
- layerId
- x, y, z
- homeX, homeY
- state
- behavior
- metadataJson
```

## Browser simulation loop

```txt
load world instance
regenerate MapData from recipe
load entity states
on animation frame:
  process player input
  update creature AI
  enforce collision/cost/portal rules
  render
on save:
  send entity states to API
```

## Server responsibilities

- create instance
- load instance
- save state snapshots
- validate owner
- never run continuous entity ticks in MVP
