# Deployment Guide

This guide describes an MVP v0.1 deployment path for World Forge.

World Forge is browser-first: map generation runs from the C++/WebAssembly artifact in the frontend. Spring Boot stores users, maps, versions, world snapshots, entity state, and search projections. PostgreSQL is the source of truth. Elasticsearch is a rebuildable projection for public map search only.

## Release Prerequisites

- Node.js and npm compatible with the workspace lockfile.
- Java 21 for the Spring Boot API.
- Emscripten activated so `em++` is on `PATH`.
- PostgreSQL 16 or a managed PostgreSQL service.
- Elasticsearch 8.x or a managed Elasticsearch-compatible service.
- A production JWT secret that is not the local default.

Run from the repository root before packaging:

```powershell
npm install
npm run verify:release
```

## Frontend Build and Deploy

The frontend is `apps/web`, built with React, Vite, and TypeScript.

Build order:

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

Production hosting requirements:

- Serve `index.html` with SPA fallback for routes such as `/editor` and `/world/{id}`.
- Serve `.wasm` files with `Content-Type: application/wasm`.
- Do not rewrite `/wasm/world_forge_engine.js` or `/wasm/world_forge_engine.wasm` through a JavaScript bundler.
- If the API is on another origin, set `VITE_API_BASE_URL` at frontend build time.

Example same-origin build:

```powershell
npm run wasm:build
npm run web:build
```

Example separate API origin build:

```powershell
$env:VITE_API_BASE_URL="https://api.example.com"
npm run wasm:build
npm run web:build
```

## WASM Artifact Path

The Emscripten build writes:

```txt
engine/wasm-engine/dist/world_forge_engine.js
engine/wasm-engine/dist/world_forge_engine.wasm
```

The same script copies browser artifacts to:

```txt
apps/web/public/wasm/world_forge_engine.js
apps/web/public/wasm/world_forge_engine.wasm
```

After `npm run web:build`, the deployed frontend must contain:

```txt
apps/web/dist/wasm/world_forge_engine.js
apps/web/dist/wasm/world_forge_engine.wasm
```

Release builds should use the real WASM artifact. The TypeScript deterministic module is a development/test fallback and must not be treated as the production generation path.

## Spring Boot Build and Deploy

The API is `apps/api`.

Build:

```powershell
cd apps/api
.\gradlew.bat clean test bootJar
```

Run the packaged service:

```powershell
java -jar build/libs/api-0.0.1-SNAPSHOT.jar
```

The API must be deployed with network access to PostgreSQL and Elasticsearch. It should not be deployed as a map generation worker or a real-time simulation server.

## PostgreSQL Setup

PostgreSQL stores the source-of-truth data:

- users
- map projects
- map versions
- recipe JSON
- stats JSON
- publish/private state
- world instances
- entity state snapshots

Local default connection:

```txt
jdbc:postgresql://localhost:5432/world_forge
user: world_forge
password: world_forge_dev
```

Local startup:

```powershell
docker compose -f infra/docker-compose.yml up -d postgres
```

Production notes:

- Use a managed database or a persistent PostgreSQL volume.
- Back up PostgreSQL; do not rely on Elasticsearch for recovery.
- Flyway applies `apps/api/src/main/resources/db/migration/V1__initial_schema.sql`.
- Keep `WORLD_FORGE_FLYWAY_ENABLED=true` for normal startup.
- Use `WORLD_FORGE_JPA_DDL_AUTO=validate` for release verification.

## Elasticsearch Setup

Elasticsearch stores only rebuildable public-map projections.

Local startup:

```powershell
docker compose -f infra/docker-compose.yml up -d elasticsearch
```

Local default:

```txt
http://localhost:9200
index: world_forge_maps
```

Production notes:

- Do not store primary data only in Elasticsearch.
- Index only public/searchable map documents.
- Do not expose Elasticsearch directly to browsers.
- Do not accept raw Elasticsearch Query DSL from clients.
- Use the Spring Boot search endpoints as the only public search interface.

## Environment Variables

Frontend build-time variables:

```txt
VITE_API_BASE_URL
```

Use an empty value or omit it for same-origin `/api` calls. Set it when the API is deployed on a separate origin.

Spring Boot runtime variables:

```txt
WORLD_FORGE_DB_URL
WORLD_FORGE_DB_USER
WORLD_FORGE_DB_PASSWORD
WORLD_FORGE_JPA_DDL_AUTO
WORLD_FORGE_FLYWAY_ENABLED

WORLD_FORGE_ELASTICSEARCH_URL
WORLD_FORGE_SEARCH_ENABLED
WORLD_FORGE_SEARCH_INDEX_NAME
WORLD_FORGE_ADMIN_ENABLED
WORLD_FORGE_ADMIN_TOKEN

WORLD_FORGE_JWT_SECRET
WORLD_FORGE_JWT_ISSUER
WORLD_FORGE_JWT_TTL_SECONDS
WORLD_FORGE_CORS_ALLOWED_ORIGINS
```

Recommended production posture:

```txt
WORLD_FORGE_JPA_DDL_AUTO=validate
WORLD_FORGE_FLYWAY_ENABLED=true
WORLD_FORGE_SEARCH_ENABLED=true
WORLD_FORGE_ADMIN_ENABLED=false
WORLD_FORGE_ADMIN_TOKEN=<strong maintenance-only token>
WORLD_FORGE_JWT_SECRET=<strong random secret>
WORLD_FORGE_JWT_ISSUER=world-forge-api
WORLD_FORGE_JWT_TTL_SECONDS=3600
WORLD_FORGE_CORS_ALLOWED_ORIGINS=https://worldforge.example.com
```

Use `WORLD_FORGE_ADMIN_ENABLED=true` only for a controlled maintenance window or protected internal environment when running reindex. The reindex request must include `X-World-Forge-Admin-Token` matching `WORLD_FORGE_ADMIN_TOKEN`.

## CORS Setup

Preferred deployment:

- Serve the frontend and API under the same origin.
- Route frontend assets from `/`.
- Route API requests to Spring Boot under `/api`.
- Route WASM assets under `/wasm`.

Example public origin layout:

```txt
https://worldforge.example.com/
https://worldforge.example.com/api/health
https://worldforge.example.com/wasm/world_forge_engine.wasm
```

If deploying frontend and API on separate origins:

- Set `VITE_API_BASE_URL` during frontend build.
- Set `WORLD_FORGE_CORS_ALLOWED_ORIGINS` on the API to the deployed frontend origin.
- Allow only the deployed frontend origin.
- Allow `Authorization` and `Content-Type` headers.
- Allow `X-World-Forge-Admin-Token` only for protected maintenance clients.
- Allow methods used by the API: `GET`, `POST`, `PUT`, `PATCH`, `OPTIONS`.
- Do not use wildcard origins with bearer-token APIs.

## Public/Private Map Security Checklist

Before release, verify:

- `POST /api/maps` requires authentication.
- `GET /api/me/maps` returns only the current user's maps.
- Private map detail returns 404 for anonymous users and non-owners.
- Public map detail is readable without authentication.
- Only `PUBLIC` map projects are indexed into Elasticsearch.
- Changing a map from `PUBLIC` to `PRIVATE` removes its search document.
- If Elasticsearch delete fails during public-to-private transition, the API must not silently leave a stale public document.
- Reindex rebuilds from PostgreSQL and removes stale private documents.
- Browser clients never call Elasticsearch directly.

Focused verification:

```powershell
cd apps/api
.\gradlew.bat test --tests com.worldforge.api.AuthApiIntegrationTests
.\gradlew.bat test --tests com.worldforge.api.MapApiIntegrationTests
.\gradlew.bat test --tests com.worldforge.api.SearchApiIntegrationTests
```

## Reindex Procedure

Reindex rebuilds `world_forge_maps` from PostgreSQL public maps.

Start the API with admin enabled in a protected environment:

```powershell
$env:WORLD_FORGE_ADMIN_ENABLED="true"
$env:WORLD_FORGE_ADMIN_TOKEN="<strong maintenance token>"
cd apps/api
.\gradlew.bat bootRun
```

Run:

```powershell
Invoke-RestMethod -Method Post "http://localhost:8080/api/admin/search/maps/reindex" -Headers @{
  "X-World-Forge-Admin-Token" = "<strong maintenance token>"
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

Policy:

- Delete/recreate the search index through the configured `MapSearchIndexClient`.
- Read only `PUBLIC` projects from PostgreSQL.
- Index each public project's current version.
- Skip public projects without a current version.
- Remove stale documents for private maps by replacing the index contents.

Disable admin after maintenance:

```txt
WORLD_FORGE_ADMIN_ENABLED=false
```

## Smoke Test Procedure

Use these checks after deployment. Replace hosts and credentials as needed.

Set common variables:

```powershell
$api = "https://worldforge.example.com"
$web = "https://worldforge.example.com"
```

Check API health:

```powershell
Invoke-RestMethod "$api/api/health"
```

Create a user and token:

```powershell
$signup = Invoke-RestMethod -Method Post "$api/api/auth/signup" -ContentType "application/json" -Body (@{
  email = "smoke-tester@example.com"
  password = "Password123!"
  nickname = "Smoke Tester"
} | ConvertTo-Json)

$headers = @{ Authorization = "Bearer $($signup.token)" }
Invoke-RestMethod "$api/api/me" -Headers $headers
```

Check frontend and WASM:

- Open `$web/editor`.
- Confirm the engine badge says `WASM`.
- Confirm the engine detail points to `/wasm/world_forge_engine.wasm`.
- Generate a map and record `mapHash`.
- Generate again with the same recipe and confirm the same `mapHash`.

Check map persistence:

- Create a map through `POST /api/maps` with the exact recipe/stats/hash generated by the editor.
- Create a second map and keep it private.
- Confirm private map search returns no result.

Check public search:

```powershell
Invoke-RestMethod -Method Patch "$api/api/maps/<projectId>" -Headers $headers -ContentType "application/json" -Body (@{
  visibility = "PUBLIC"
} | ConvertTo-Json)

Invoke-RestMethod "$api/api/search/maps?keyword=<title>"
Invoke-RestMethod "$api/api/search/maps?minCreatureCount=1&minReachableAreaRatio=0.5"
Invoke-RestMethod "$api/api/search/maps/facets"
```

Check public map fork/open flow:

- Sign in to the frontend.
- Open `$web/search`.
- Search for a public map.
- Click `Fork & Open`.
- Confirm a private fork appears under `$web/maps`.
- Confirm the opened World Instance uses the forked map version.

Check World Instance snapshot flow:

- Create a world instance for a saved map version.
- Open `$web/world/<worldInstanceId>`.
- Store the token in the browser if using bearer-token local storage:

```javascript
localStorage.setItem("worldForge.authToken", "<token>")
```

- Move the player in 2D.
- Switch to 3D and confirm the same player/entity positions are shown.
- Save, reload, and confirm positions and layer are restored.

Final full verification command from the repository root:

```powershell
npm run verify:release
```
