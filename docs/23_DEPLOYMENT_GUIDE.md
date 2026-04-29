# Deployment Guide

This guide describes how to prepare and deploy the current World Forge MVP.

World Forge is browser-first: map generation runs in the frontend through the C++/WebAssembly artifact. Spring Boot stores users, map projects, versions, world snapshots, entity state, ownership, visibility, search indexing, and safe search APIs. PostgreSQL is the source of truth. Elasticsearch is a rebuildable public-map projection.

## Architecture Summary

```txt
Browser
  React + Vite + TypeScript
  C++/WebAssembly map generation engine
  Canvas 2D, height, side, and basic 3D preview
  Client-side World Instance movement and entity wander

Spring Boot API
  Email/password signup and login
  JWT bearer authentication
  MapProject and MapVersion persistence
  Public/private visibility and ownership checks
  WorldInstance and EntityState snapshot persistence
  Safe public search APIs
  Elasticsearch indexing and reindex maintenance endpoint

PostgreSQL
  Source of truth for users, maps, versions, recipes, stats, hashes, worlds, and entity states

Elasticsearch
  Search projection for public maps only
  Feature, algorithm, stats, livingStats, facets, and similar-map search
```

MVP boundaries:

- The API must not become a map generation server.
- The API must not run real-time simulation ticks.
- The browser must not call Elasticsearch directly.
- Private maps must not be indexed or returned from public search.

## Local Docker Compose

Start local infrastructure from the repository root:

```powershell
docker compose -f infra/docker-compose.yml up -d postgres elasticsearch
docker compose -f infra/docker-compose.yml ps
```

Default local services:

```txt
PostgreSQL:     localhost:5432
Database:       world_forge
User:           world_forge
Password:       world_forge_dev

Elasticsearch:  http://localhost:9200
Index:          world_forge_maps
```

Stop local infrastructure:

```powershell
docker compose -f infra/docker-compose.yml down
```

Remove local persisted volumes only when intentionally resetting all local data:

```powershell
docker compose -f infra/docker-compose.yml down -v
```

## Build Order

Use this order for a release build:

```powershell
npm install
npm run shared:build
npm run wasm-wrapper:build
npm run wasm:build
npm run web:build
npm run api:build
```

Run the full release verification from an Emscripten-activated shell where `em++` is on `PATH`:

```powershell
npm run verify:release
```

## Frontend Build And Deploy

The frontend lives in:

```txt
apps/web/
```

Build:

```powershell
npm run shared:build
npm run wasm-wrapper:build
npm run wasm:build
npm run web:build
```

Deploy the static output from:

```txt
apps/web/dist/
```

Hosting requirements:

- Serve `index.html` with SPA fallback for routes such as `/editor`, `/me/worlds`, `/maps/{projectId}`, `/gallery`, `/explore`, and `/world/{worldInstanceId}`.
- Serve `/wasm/world_forge_engine.js` and `/wasm/world_forge_engine.wasm` as static files.
- Serve `.wasm` with `Content-Type: application/wasm`.
- Do not pipe `/wasm/world_forge_engine.js` through Vite transforms at runtime.
- If the API is on another origin, set `VITE_API_BASE_URL` at frontend build time.

Same-origin deployment:

```powershell
npm run wasm:build
npm run web:build
```

Separate API origin deployment:

```powershell
$env:VITE_API_BASE_URL="https://api.example.com"
npm run wasm:build
npm run web:build
```

## WASM Artifact Build And Deploy Path

The C++/Emscripten engine lives in:

```txt
engine/wasm-engine/
```

Build command:

```powershell
npm run wasm:build
```

The build emits:

```txt
engine/wasm-engine/dist/world_forge_engine.js
engine/wasm-engine/dist/world_forge_engine.wasm
```

The build script also copies browser artifacts into Vite public assets:

```txt
apps/web/public/wasm/world_forge_engine.js
apps/web/public/wasm/world_forge_engine.wasm
```

After `npm run web:build`, the deployed static bundle must include:

```txt
apps/web/dist/wasm/world_forge_engine.js
apps/web/dist/wasm/world_forge_engine.wasm
```

Deployment check:

- Open `/editor`.
- Confirm the engine badge shows `WASM`.
- Generate a map.
- Confirm browser Network tools load `/wasm/world_forge_engine.js` and `/wasm/world_forge_engine.wasm`.

The TypeScript deterministic generator is a development/test fallback only. It must not be presented as the production generation path.

## Spring Boot Build And Deploy

The API lives in:

```txt
apps/api/
```

Build and test:

```powershell
cd apps/api
.\gradlew.bat clean test bootJar
```

Run the packaged application:

```powershell
java -jar build/libs/api-0.0.1-SNAPSHOT.jar
```

The API requires network access to:

- PostgreSQL
- Elasticsearch, when `WORLD_FORGE_SEARCH_ENABLED=true`

The API should be deployed as a normal request/response service. It must not be deployed as a map generation worker or real-time simulation service.

## PostgreSQL Configuration

PostgreSQL stores source-of-truth data:

- `AppUser`
- `MapProject`
- `MapVersion`
- recipe JSON
- stats JSON
- `mapHash`
- public/private visibility
- `WorldInstance`
- `EntityState`

Local defaults:

```txt
WORLD_FORGE_DB_URL=jdbc:postgresql://localhost:5432/world_forge
WORLD_FORGE_DB_USER=world_forge
WORLD_FORGE_DB_PASSWORD=world_forge_dev
WORLD_FORGE_JPA_DDL_AUTO=validate
WORLD_FORGE_FLYWAY_ENABLED=true
```

Migration path:

```txt
apps/api/src/main/resources/db/migration/
```

Production requirements:

- Use persistent storage or a managed PostgreSQL service.
- Back up PostgreSQL; Elasticsearch is not a backup.
- Keep `WORLD_FORGE_FLYWAY_ENABLED=true` unless migrations are handled externally.
- Use `WORLD_FORGE_JPA_DDL_AUTO=validate` in production.
- Do not use `create`, `create-drop`, or `update` for production schema management.

## Elasticsearch Configuration

Elasticsearch stores only public-map search projections.

Local defaults:

```txt
WORLD_FORGE_ELASTICSEARCH_URL=http://localhost:9200
WORLD_FORGE_SEARCH_ENABLED=true
WORLD_FORGE_SEARCH_INDEX_NAME=world_forge_maps
```

Production requirements:

- Use Elasticsearch 8.x or a compatible managed service.
- Do not expose Elasticsearch directly to browsers.
- Do not accept raw Elasticsearch Query DSL from clients.
- Rebuild the index from PostgreSQL when needed.
- Treat Elasticsearch documents as disposable projections.
- Ensure private maps are removed from the index when visibility changes to private.

Search endpoints exposed through Spring Boot:

```txt
GET /api/search/maps
GET /api/search/maps/facets
GET /api/search/maps/{projectId}/similar
```

## Environment Variables

Environment templates live at the repository root:

```txt
.env.local.example
.env.production.example
```

Use `.env.local.example` for local development and local Docker Compose validation. Use `.env.production.example` as a deployment checklist only; replace every production placeholder through your deployment platform or secret manager.

Frontend build-time variables:

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | No | API origin for browser requests. Leave unset for same-origin `/api` calls. |
| `VITE_WEB_PORT` | No | Frontend dev/static host port used by local/deployment scripts. Current Vite default is `5173` unless a command passes `--port`. |

Spring Boot runtime variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | No | unset | Runtime profile marker such as `local` or `production`. |
| `SERVER_PORT` | No | `8080` | Spring Boot HTTP port. |
| `WORLD_FORGE_DB_URL` | Yes | `jdbc:postgresql://localhost:5432/world_forge` | PostgreSQL JDBC URL. |
| `WORLD_FORGE_DB_USER` | Yes | `world_forge` | PostgreSQL username. |
| `WORLD_FORGE_DB_PASSWORD` | Yes | `world_forge_dev` | PostgreSQL password. |
| `WORLD_FORGE_JPA_DDL_AUTO` | Yes | `validate` | Hibernate DDL mode. Use `validate` in production. |
| `WORLD_FORGE_FLYWAY_ENABLED` | Yes | `true` | Enables Flyway migrations. |
| `WORLD_FORGE_ELASTICSEARCH_URL` | Yes when search enabled | `http://localhost:9200` | Elasticsearch URL. |
| `WORLD_FORGE_SEARCH_ENABLED` | Yes | `true` | Enables real Elasticsearch indexing/search. |
| `WORLD_FORGE_SEARCH_INDEX_NAME` | Yes | `world_forge_maps` | Elasticsearch index name. |
| `WORLD_FORGE_ADMIN_ENABLED` | No | `false` | Enables admin maintenance endpoints such as reindex. |
| `WORLD_FORGE_ADMIN_TOKEN` | Only if admin enabled | empty | Token required in `X-World-Forge-Admin-Token`. |
| `WORLD_FORGE_JWT_SECRET` | Yes | local dev default | HMAC-SHA256 JWT signing secret. Must be strong in production. |
| `WORLD_FORGE_JWT_ISSUER` | Yes | `world-forge-api` | JWT issuer claim. |
| `WORLD_FORGE_JWT_TTL_SECONDS` | Yes | `3600` | Access token lifetime in seconds. |
| `WORLD_FORGE_CORS_ALLOWED_ORIGINS` | Required for cross-origin frontend | empty | Comma-separated allowed frontend origins. |

WASM artifact path:

```txt
/wasm/world_forge_engine.js
/wasm/world_forge_engine.wasm
```

The current frontend does not read an environment variable for the WASM artifact path. Build with `npm run wasm:build` and serve the files above from the deployed frontend origin.

Recommended production values:

```txt
SPRING_PROFILES_ACTIVE=production
SERVER_PORT=8080
WORLD_FORGE_JPA_DDL_AUTO=validate
WORLD_FORGE_FLYWAY_ENABLED=true
WORLD_FORGE_SEARCH_ENABLED=true
WORLD_FORGE_ADMIN_ENABLED=false
WORLD_FORGE_JWT_ISSUER=world-forge-api
WORLD_FORGE_JWT_TTL_SECONDS=3600
WORLD_FORGE_CORS_ALLOWED_ORIGINS=https://worldforge.example.com
```

## CORS Configuration

Preferred deployment is same-origin:

```txt
https://worldforge.example.com/
https://worldforge.example.com/api/health
https://worldforge.example.com/wasm/world_forge_engine.wasm
```

For same-origin deployment, `WORLD_FORGE_CORS_ALLOWED_ORIGINS` can remain empty.

For separate frontend/API origins:

- Set `VITE_API_BASE_URL` during frontend build.
- Set `WORLD_FORGE_CORS_ALLOWED_ORIGINS` to the deployed frontend origin.
- Do not use wildcard CORS with bearer-token APIs.
- Allow `Authorization` and `Content-Type`.
- Allow `X-World-Forge-Admin-Token` only for protected maintenance clients.
- Allow API methods used by the app: `GET`, `POST`, `PUT`, `PATCH`, and `OPTIONS`.

Example:

```powershell
$env:VITE_API_BASE_URL="https://api.worldforge.example.com"
$env:WORLD_FORGE_CORS_ALLOWED_ORIGINS="https://worldforge.example.com"
```

## JWT Secret Configuration

The API signs JWTs with HMAC-SHA256 using `WORLD_FORGE_JWT_SECRET` as a plain string secret.

Production requirements:

- Set `WORLD_FORGE_JWT_SECRET`; never use the local default.
- Use a long random value, at least 32 bytes of entropy.
- Store the secret in the deployment platform secret manager.
- Keep the same secret across rolling API instances.
- Rotating the secret invalidates existing tokens unless a multi-key rotation strategy is added later.

Example secret generation in PowerShell:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Then set:

```powershell
$env:WORLD_FORGE_JWT_SECRET="<generated-random-secret>"
```

## Public/Private Map Security Checklist

Before production release, verify:

- `POST /api/maps` requires authentication.
- `GET /api/me/maps` returns only maps owned by the current user.
- `GET /api/maps/{projectId}` allows owners to read private maps.
- `GET /api/maps/{projectId}` allows anonymous reads for public maps.
- `GET /api/maps/{projectId}` denies anonymous and non-owner reads for private maps.
- `PATCH /api/maps/{projectId}` requires ownership.
- `POST /api/maps/{projectId}/versions` requires ownership.
- `POST /api/world-instances` creates worlds only for maps the user can access.
- `GET/PUT /api/world-instances/{id}/state` requires ownership.
- Public search returns only public maps.
- Changing a public map to private deletes its search projection.
- Reindex rebuilds from PostgreSQL and removes stale private documents.
- Browser code calls Spring Boot search APIs only.

Focused backend tests:

```powershell
cd apps/api
.\gradlew.bat test --tests com.worldforge.api.AuthApiIntegrationTests
.\gradlew.bat test --tests com.worldforge.api.MapApiIntegrationTests
.\gradlew.bat test --tests com.worldforge.api.WorldInstanceApiIntegrationTests
.\gradlew.bat test --tests com.worldforge.api.SearchApiIntegrationTests
.\gradlew.bat test --tests com.worldforge.api.E2eSmokeApiIntegrationTests
```

## Elasticsearch Reindex

Reindex rebuilds `world_forge_maps` from PostgreSQL public maps.

Enable admin only in a protected maintenance context:

```powershell
$env:WORLD_FORGE_ADMIN_ENABLED="true"
$env:WORLD_FORGE_ADMIN_TOKEN="<strong-maintenance-token>"
cd apps/api
.\gradlew.bat bootRun
```

Run reindex:

```powershell
Invoke-RestMethod -Method Post "http://localhost:8080/api/admin/search/maps/reindex" -Headers @{
  "X-World-Forge-Admin-Token" = "<strong-maintenance-token>"
}
```

Expected response fields:

```txt
indexName
publicProjects
indexedDocuments
skippedProjects
rebuiltAt
```

Reindex policy:

- Query PostgreSQL for public map projects.
- Convert each public current version through the existing projection code.
- Replace the Elasticsearch index contents.
- Skip public projects without a current version.
- Do not index private maps.

Disable admin after maintenance:

```txt
WORLD_FORGE_ADMIN_ENABLED=false
```

## Production Deployment Notes

- Build the real WASM artifact before frontend build.
- Keep `apps/web/dist/wasm/` artifacts with the frontend deployment.
- Use HTTPS for all public traffic.
- Prefer same-origin frontend/API deployment to simplify CORS.
- Use a managed PostgreSQL database or persistent volume with backups.
- Use a managed Elasticsearch service or persistent Elasticsearch volume.
- Keep Elasticsearch private to the API network.
- Store all secrets in the deployment platform secret manager.
- Do not enable admin endpoints publicly.
- Do not run Spring Boot as a simulation server.
- Do not add Java map generation as a production fallback.
- Confirm `VITE_API_BASE_URL` is correct before building static assets.
- Confirm SPA fallback does not intercept `/api/*` or `/wasm/*`.
- Confirm `.wasm` is served with `application/wasm`.
- Monitor API logs during publish/private transitions and reindex.

## Smoke Test Procedure

Use these checks after deploying. Replace hosts and credentials as needed.

Set common variables:

```powershell
$api = "https://worldforge.example.com"
$web = "https://worldforge.example.com"
```

Check health:

```powershell
Invoke-RestMethod "$api/api/health"
```

Create a test user:

```powershell
$signup = Invoke-RestMethod -Method Post "$api/api/auth/signup" -ContentType "application/json" -Body (@{
  email = "smoke-tester@example.com"
  password = "Password123!"
  nickname = "Smoke Tester"
} | ConvertTo-Json)

$headers = @{ Authorization = "Bearer $($signup.token)" }
Invoke-RestMethod "$api/api/me" -Headers $headers
```

Check frontend generation:

- Open `$web/editor`.
- Confirm the engine badge says `WASM`.
- Generate a map.
- Record `mapHash`.
- Generate again with the same recipe and confirm the same `mapHash`.
- Change seed and confirm `mapHash` changes.

Check map save and ownership:

- Save the generated map as private.
- Open `$web/me/worlds`.
- Confirm the map appears in `Map Projects`.
- Open `/maps/{projectId}`.
- Confirm title, visibility, recipe details, stats, living stats, and `mapHash`.

Check World Instance:

- Create or open a World Instance from Map Detail or My Worlds.
- Move the player with arrow keys.
- Confirm blocked tiles cannot be entered.
- Use a cave portal when available.
- Click `Save`.
- Reload `/world/{worldInstanceId}`.
- Confirm player/entity positions and layer are restored.

Check publish and search:

- Publish the map from `/me/worlds`.
- Open `$web/gallery` or `$web/explore`.
- Search by title.
- Try feature, algorithm, stats, and livingStats filters.
- Confirm facets are visible.
- Confirm a private map title does not appear in search.

Check reindex:

```powershell
Invoke-RestMethod -Method Post "$api/api/admin/search/maps/reindex" -Headers @{
  "X-World-Forge-Admin-Token" = "<strong-maintenance-token>"
}
```

After reindex:

```powershell
Invoke-RestMethod "$api/api/search/maps?keyword=<public-title>"
Invoke-RestMethod "$api/api/search/maps?keyword=<private-title>"
Invoke-RestMethod "$api/api/search/maps/facets"
```

Expected result:

- Public map remains searchable.
- Private map remains hidden.
- Facets still return public-map counts.

Run final verification from the repository root when source and toolchain are available:

```powershell
npm run verify:release
```
