# World Forge API

Spring Boot + Gradle service scaffold.

The API stores map projects, map versions, world instances, and entity-state snapshots. It does not generate maps, run World Instance simulation ticks, implement authentication, or query Elasticsearch in this phase.

## Dev user strategy

Authentication is intentionally not implemented yet. All MVP map endpoints use a local development owner created on demand:

```txt
email: dev@worldforge.local
nickname: Local Dev User
```

This keeps ownership checks explicit while avoiding an auth dependency before the persistence flow is stable. Replace `DevUserProvider` when real authentication is introduced.

## PostgreSQL

Runtime database defaults match `infra/docker-compose.yml`:

```txt
url: jdbc:postgresql://localhost:5432/world_forge
user: world_forge
password: world_forge_dev
```

Override with:

```txt
WORLD_FORGE_DB_URL
WORLD_FORGE_DB_USER
WORLD_FORGE_DB_PASSWORD
WORLD_FORGE_JPA_DDL_AUTO
```

Recipe and stats are validated as JSON and stored as raw JSON text in the MVP entities. PostgreSQL remains the source of truth; a later migration can move these columns to `jsonb` once database migrations are introduced.

World instances store the selected `mapVersionId`, `worldTime`, and entity snapshots. The browser loads the map version recipe, regenerates `MapData` client-side, runs movement/wander locally, and saves snapshots back through `PUT /api/world-instances/{id}/state`.

## Elasticsearch search projection

Elasticsearch stores rebuildable public-map projections in the `world_forge_maps` index. PostgreSQL remains the source of truth.

Only `PUBLIC` map projects are indexed. Updating a map to `PRIVATE` removes its projection, and creating a new version for a public map replaces the indexed document with the current version. Clients never submit raw Elasticsearch Query DSL; `/api/search/maps` accepts safe query parameters and translates them server-side.

Runtime search defaults:

```txt
url: http://localhost:9200
index: world_forge_maps
enabled: true
```

Override with:

```txt
WORLD_FORGE_ELASTICSEARCH_URL
WORLD_FORGE_SEARCH_ENABLED
WORLD_FORGE_SEARCH_INDEX_NAME
```

## MVP endpoints

```txt
GET  /api/health
POST /api/maps
GET  /api/maps/{projectId}
GET  /api/me/maps
PATCH /api/maps/{projectId}
POST /api/maps/{projectId}/versions
GET  /api/maps/{projectId}/versions
GET  /api/map-versions/{versionId}
POST /api/world-instances
GET  /api/world-instances/{worldInstanceId}
GET  /api/world-instances/{worldInstanceId}/state
PUT  /api/world-instances/{worldInstanceId}/state
GET  /api/me/world-instances
GET  /api/search/maps
GET  /api/search/maps/facets
```

Search examples:

```powershell
Invoke-RestMethod "http://localhost:8080/api/search/maps?keyword=forest&features=forests,roads&terrainAlgorithm=noise-island&minWidth=128&maxWidth=512&minForestRatio=0.2"
Invoke-RestMethod "http://localhost:8080/api/search/maps?mapType=mountain&minMountainRatio=0.25"
Invoke-RestMethod "http://localhost:8080/api/search/maps/facets"
```

## Commands

```powershell
docker compose -f ..\..\infra\docker-compose.yml up -d postgres elasticsearch
.\gradlew.bat test
.\gradlew.bat bootRun
```
