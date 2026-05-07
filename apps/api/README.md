# World Forge API

Spring Boot + Gradle service for World Forge MVP v0.1.

The API stores users, map projects, map versions, world instances, entity-state snapshots, publish state, and search projections. It does not generate maps or run World Instance simulation ticks. Map generation remains a browser WASM responsibility.

## Auth and ownership

MVP v0.1+ uses email/password signup plus stateless JWT bearer tokens.

```powershell
$signup = Invoke-RestMethod -Method Post "http://localhost:8080/api/auth/signup" -ContentType "application/json" -Body (@{
  email = "dev@example.com"
  password = "Password123!"
  nickname = "Dev User"
} | ConvertTo-Json)

$token = $signup.token
$headers = @{ Authorization = "Bearer $token" }

Invoke-RestMethod "http://localhost:8080/api/me" -Headers $headers
```

Login returns the same response shape:

```powershell
$login = Invoke-RestMethod -Method Post "http://localhost:8080/api/auth/login" -ContentType "application/json" -Body (@{
  email = "dev@example.com"
  password = "Password123!"
} | ConvertTo-Json)
```

When the `prod` or `production` Spring profile is active, `WORLD_FORGE_JWT_SECRET` must be a non-default secret of at least 32 characters. The local default is only for development.

Ownership rules:

- `POST /api/maps`, `GET /api/me/maps`, `PATCH /api/maps/{projectId}`, version writes, and all World Instance endpoints require a bearer token.
- Users can manage only their own `MapProject`, `MapVersion`, and `WorldInstance` records.
- Private maps and private map versions return 404 to anonymous users and non-owners.
- Public map detail and public map versions are readable without authentication.
- Public map search remains unauthenticated.
- Public maps can be forked into the authenticated user's private map library with `POST /api/maps/{projectId}/fork`.
- The old auto-created local dev user strategy has been removed; tests now create explicit users through signup.

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
WORLD_FORGE_FLYWAY_ENABLED
WORLD_FORGE_JWT_SECRET
WORLD_FORGE_JWT_ISSUER
WORLD_FORGE_JWT_TTL_SECONDS
WORLD_FORGE_CORS_ALLOWED_ORIGINS
```

Recipe and stats are validated as JSON and stored as raw JSON text in the MVP entities. PostgreSQL remains the source of truth; a later migration can move these columns to `jsonb`.

### Schema setup

Local development and release startup use Flyway for the MVP schema:

```txt
spring.flyway.enabled=${WORLD_FORGE_FLYWAY_ENABLED:true}
spring.jpa.hibernate.ddl-auto=${WORLD_FORGE_JPA_DDL_AUTO:validate}
```

For a clean local database, start PostgreSQL and run `.\gradlew.bat bootRun`; Flyway applies `src/main/resources/db/migration/V1__initial_schema.sql`, then Hibernate validates the entity mapping. Tests disable Flyway and use H2 with `ddl-auto=create-drop`.

World instances store the selected `mapVersionId`, `worldTime`, and entity snapshots. The browser loads the map version recipe, regenerates `MapData` client-side, runs movement/wander locally, and saves snapshots back through `PUT /api/world-instances/{id}/state`.

## CORS

By default the API does not add CORS headers. For same-origin local/proxy deployments, leave `WORLD_FORGE_CORS_ALLOWED_ORIGINS` empty. For a separate frontend origin, set a comma-separated allow list:

```powershell
$env:WORLD_FORGE_CORS_ALLOWED_ORIGINS="http://localhost:5173,https://worldforge.example.com"
```

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
WORLD_FORGE_ADMIN_TOKEN
```

### Rebuild search index

`POST /api/admin/search/maps/reindex` is a dev/admin maintenance endpoint. It is disabled by default and also requires `X-World-Forge-Admin-Token` to match `WORLD_FORGE_ADMIN_TOKEN` when enabled.

Enable it locally with:

```powershell
$env:WORLD_FORGE_ADMIN_ENABLED="true"
$env:WORLD_FORGE_ADMIN_TOKEN="local-admin-token"
.\gradlew.bat bootRun
```

Then rebuild the search projection from PostgreSQL:

```powershell
Invoke-RestMethod -Method Post "http://localhost:8080/api/admin/search/maps/reindex" -Headers @{
  "X-World-Forge-Admin-Token" = "local-admin-token"
}
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
POST /api/auth/signup
POST /api/auth/login
GET  /api/me
POST /api/maps
GET  /api/maps/{projectId}
GET  /api/me/maps
PATCH /api/maps/{projectId}
POST /api/maps/{projectId}/versions
POST /api/maps/{projectId}/fork
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

Fork a public map before creating a World Instance:

```powershell
$forked = Invoke-RestMethod -Method Post "http://localhost:8080/api/maps/<publicProjectId>/fork" -Headers $headers
$world = Invoke-RestMethod -Method Post "http://localhost:8080/api/world-instances" -Headers $headers -ContentType "application/json" -Body (@{
  mapVersionId = $forked.currentVersionId
  name = $forked.title
  worldTime = 0
  entities = @()
} | ConvertTo-Json -Depth 10)
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

Focused auth/ownership verification:

```powershell
.\gradlew.bat test --tests com.worldforge.api.AuthApiIntegrationTests
.\gradlew.bat test --tests com.worldforge.api.MapApiIntegrationTests
.\gradlew.bat test --tests com.worldforge.api.WorldInstanceApiIntegrationTests
```

## Docker image

The API image uses a Java 21 multi-stage build and runs the Spring Boot `bootJar`.

Build from the repository root with `apps/api` as the Docker build context:

```powershell
docker build -f apps/api/Dockerfile -t world-forge-api:local apps/api
```

Run against the local PostgreSQL and Elasticsearch services started from `infra/docker-compose.yml`:

```powershell
docker compose -f infra/docker-compose.yml up -d postgres elasticsearch

docker run --rm --name world-forge-api `
  --network world-forge_default `
  -p 8080:8080 `
  -e SERVER_PORT=8080 `
  -e WORLD_FORGE_DB_URL="jdbc:postgresql://postgres:5432/world_forge" `
  -e WORLD_FORGE_DB_USER="world_forge" `
  -e WORLD_FORGE_DB_PASSWORD="world_forge_dev" `
  -e WORLD_FORGE_ELASTICSEARCH_URL="http://elasticsearch:9200" `
  -e WORLD_FORGE_JWT_SECRET="local-dev-change-me-32-byte-placeholder" `
  -e WORLD_FORGE_CORS_ALLOWED_ORIGINS="http://localhost:5173" `
  world-forge-api:local
```

The container listens on `SERVER_PORT` internally. The example above maps host port `8080` to container port `8080`. The image healthcheck calls:

```txt
GET /api/health
```

Container-specific notes:

- Use `jdbc:postgresql://postgres:5432/world_forge` when the container joins the `world-forge_default` compose network.
- Use `http://elasticsearch:9200` when the container joins the same compose network.
- Inject production secrets through the deployment platform; do not bake them into the image.
- The API container is a data/service server only. It does not generate maps and does not run World Instance simulation ticks.
