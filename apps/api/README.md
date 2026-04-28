# World Forge API

Spring Boot + Gradle service for World Forge MVP v0.1.

The API stores map projects, map versions, world instances, entity-state snapshots, publish state, and search projections. It does not generate maps, run World Instance simulation ticks, or implement authentication. Map generation remains a browser WASM responsibility.

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

### Schema setup

Local development uses Hibernate schema update:

```txt
spring.jpa.hibernate.ddl-auto=${WORLD_FORGE_JPA_DDL_AUTO:update}
```

There is no Flyway/Liquibase migration set yet. For a clean local database, start PostgreSQL and run `.\gradlew.bat bootRun`; Hibernate creates or updates the MVP tables on startup. For release verification against an existing schema, set `WORLD_FORGE_JPA_DDL_AUTO=validate` and run the API tests or boot the service.

World instances store the selected `mapVersionId`, `worldTime`, and entity snapshots. The browser loads the map version recipe, regenerates `MapData` client-side, runs movement/wander locally, and saves snapshots back through `PUT /api/world-instances/{id}/state`.

## Elasticsearch search projection

Elasticsearch stores rebuildable public-map projections in the `world_forge_maps` index. PostgreSQL remains the source of truth.

Only `PUBLIC` map projects are indexed. Updating a map to `PRIVATE` removes its projection; if Elasticsearch is enabled and that delete fails, the visibility update fails instead of silently leaving a stale public document. Creating a new version for a public map replaces the indexed document with the current version. Clients never submit raw Elasticsearch Query DSL; search endpoints accept safe query parameters and translate them server-side.

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
WORLD_FORGE_ADMIN_ENABLED
```

### Rebuild search index

`POST /api/admin/search/maps/reindex` is a dev/admin maintenance endpoint. It is disabled by default because authentication is not implemented yet.

Enable it locally with:

```powershell
$env:WORLD_FORGE_ADMIN_ENABLED="true"
.\gradlew.bat bootRun
```

Then rebuild the search projection from PostgreSQL:

```powershell
Invoke-RestMethod -Method Post "http://localhost:8080/api/admin/search/maps/reindex"
```

Reindex policy:

- Delete/recreate the `world_forge_maps` index.
- Read only `PUBLIC` map projects from PostgreSQL.
- Index each project's current `MapVersion`.
- Skip public projects without a current version.
- Private maps are never indexed, and stale private documents are removed by the index rebuild.

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
GET  /api/search/maps/{projectId}/similar
POST /api/admin/search/maps/reindex
```

Search examples:

```powershell
Invoke-RestMethod "http://localhost:8080/api/search/maps?keyword=forest&features=forests,roads&terrainAlgorithm=noise-island&minWidth=128&maxWidth=512&minForestRatio=0.2"
Invoke-RestMethod "http://localhost:8080/api/search/maps?mapType=mountain&minMountainRatio=0.25"
Invoke-RestMethod "http://localhost:8080/api/search/maps?livingActivity=inhabited&minCreatureCount=10&minReachableAreaRatio=0.8"
Invoke-RestMethod "http://localhost:8080/api/search/maps/facets"
Invoke-RestMethod "http://localhost:8080/api/search/maps/{projectId}/similar?size=5"
```

## Commands

From the repository root:

```powershell
docker compose -f infra/docker-compose.yml up -d postgres elasticsearch
npm run api:test
```

From `apps/api`:

```powershell
docker compose -f ..\..\infra\docker-compose.yml up -d postgres elasticsearch
.\gradlew.bat test
.\gradlew.bat bootRun
```

Focused search verification:

```powershell
.\gradlew.bat test --tests com.worldforge.api.SearchApiIntegrationTests
```
