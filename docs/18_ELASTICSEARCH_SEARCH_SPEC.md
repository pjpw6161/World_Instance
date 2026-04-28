# Elasticsearch Search Spec

## Role

Elasticsearch indexes public map documents for search, filters, facets, and similar-map features.

## Source of truth

PostgreSQL remains source of truth. Elasticsearch documents are rebuildable projections.

## Index: world_forge_maps

Example document:

```json
{
  "mapVersionId": 123,
  "projectId": 45,
  "ownerId": 7,
  "title": "Dense Forest Island",
  "description": "A large island with forests, roads and caves",
  "visibility": "public",
  "mapType": "island",
  "seed": 18392,
  "width": 512,
  "height": 512,
  "features": ["trees", "roads", "caves", "villages"],
  "algorithms": {
    "terrain": "noise-island",
    "cave": "cellular-automata",
    "road": "astar"
  },
  "stats": {
    "landRatio": 0.61,
    "waterRatio": 0.39,
    "forestRatio": 0.27,
    "mountainRatio": 0.13,
    "treeCount": 1840,
    "roadLength": 291,
    "caveAreaRatio": 0.08
  },
  "livingStats": {
    "creatureCount": 30,
    "surfaceCreatureCount": 22,
    "caveCreatureCount": 8,
    "reachableAreaRatio": 0.72,
    "portalCount": 3,
    "blockedTileRatio": 0.21
  },
  "tags": ["forest", "island", "large", "roads"],
  "mapDnaVector": [0.61, 0.39, 0.27, 0.13, 0.08, 0.21],
  "createdAt": "2026-04-28T00:00:00Z"
}
```

## Search API DTO

Do not accept raw Elasticsearch Query DSL.

```json
{
  "keyword": "forest island",
  "features": ["trees", "roads"],
  "terrainAlgorithm": "noise-island",
  "minForestRatio": 0.2,
  "minCreatureCount": 10,
  "minReachableAreaRatio": 0.7,
  "minWidth": 128,
  "maxWidth": 512
}
```

## Facets

Return counts for:

- mapType
- features
- algorithms
- livingActivity
- creatureCount ranges
- surfaceCreatureCount ranges
- caveCreatureCount ranges
- reachableAreaRatio ranges
- portalCount ranges
- blockedTileRatio ranges

## Similar maps

Later: use `mapDnaVector` or stat-distance query.

## Indexing flow

```txt
publish map
  -> verify PostgreSQL project/version and owner
  -> build search document
  -> index to world_forge_maps

unpublish map
  -> remove or mark hidden in index
```
