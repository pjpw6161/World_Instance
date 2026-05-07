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

Prerequisites for a clean clone:

- Docker Desktop with the Linux engine running
- Node.js and npm
- Java 21 for local Gradle/API checks
- Emscripten SDK with `em++` available in the shell before running `npm run wasm:build`
- PowerShell on Windows or Bash on Linux/macOS

Review or copy the local environment template:

```powershell
Get-Content .env.local.example
Copy-Item .env.local.example .env.local
```

The documented commands use `.env.local.example` so a clean clone can be validated without creating local secret files. If you edit `.env.local`, pass `--env-file .env.local` instead. Do not commit real secrets; `.env.production.example` is only a checklist and every production secret must come from the deployment platform or secret manager.

Start local infrastructure from the repository root:

```powershell
docker compose --env-file .env.local.example -f infra/docker-compose.yml up -d postgres elasticsearch
docker compose --env-file .env.local.example -f infra/docker-compose.yml ps
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
docker compose --env-file .env.local.example -f infra/docker-compose.yml down
```

Remove local persisted volumes only when intentionally resetting all local data:

```powershell
docker compose --env-file .env.local.example -f infra/docker-compose.yml down -v
```

Run the local full-stack compose from the repository root:

```powershell
# Required after a clean clone: activate Emscripten so em++ is on PATH.
# Example when emsdk is installed at C:\emsdk:
& "C:\emsdk\emsdk_env.ps1"
em++ --version

npm run wasm:build
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example up --build
```

`npm run wasm:build` selects `engine/wasm-engine/scripts/build-wasm.ps1` on Windows and `engine/wasm-engine/scripts/build-wasm.sh` on Linux/macOS. API build/test scripts select `gradlew.bat` on Windows and `./gradlew` on Linux/macOS.

Local full-stack defaults:

```txt
Web frontend: http://localhost:5173
Spring Boot API: http://localhost:8080
PostgreSQL: compose service postgres:5432
Elasticsearch: compose service elasticsearch:9200
```

The full-stack override keeps Elasticsearch off the host port map by resetting the base `9200:9200` port publication. The browser must not call Elasticsearch directly; the web image is built with `VITE_API_BASE_URL=http://localhost:8080`, so search goes through Spring Boot `/api/search/*`.

The local example uses `WORLD_FORGE_JPA_DDL_AUTO=update` so old development volumes can be bootstrapped or healed. Production must use `WORLD_FORGE_JPA_DDL_AUTO=validate`.

Verify local full-stack config without starting containers:

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example config
```

Verify local full-stack after startup:

```powershell
Invoke-RestMethod "http://localhost:8080/api/health"
Invoke-WebRequest "http://localhost:5173/editor"
curl.exe -I "http://localhost:5173/wasm/world_forge_engine.wasm"
```

The WASM artifact should be available from the frontend origin and served as `application/wasm`.

Run a local reindex through the Spring Boot API container:

```powershell
.\scripts\reindex-search.ps1 `
  -ApiBaseUrl "http://localhost:8080" `
  -AdminToken "local-admin-token-change-me"
```

Expected output includes `Public projects`, `Indexed documents`, `Skipped projects`, and `Rebuilt at`. `0` indexed documents is valid when no public maps exist yet.

Run the local API smoke test:

```powershell
.\scripts\smoke-test-api.ps1 `
  -ApiBaseUrl "http://localhost:8080" `
  -AdminToken "local-admin-token-change-me" `
  -Prefix "WF-SMOKE"
```

The smoke script creates test data with the supplied prefix, verifies private maps are not searchable, publishes one map, runs reindex through Spring Boot, verifies public search, and checks facets. It never calls Elasticsearch directly.

First logs to check when local startup or smoke tests fail:

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example logs api
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example logs web
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example logs postgres
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example logs elasticsearch
```

## Production Docker Compose

`infra/docker-compose.prod.yml` is a production-like single-VM or staging compose file. It includes Web, API, PostgreSQL, and Elasticsearch.

The production compose file is intentionally standalone. Do not combine it with `infra/docker-compose.yml`, which is local infrastructure only.

Default production compose behavior:

- Builds API and Web images from the current checkout and tags them with `WORLD_FORGE_API_IMAGE` and `WORLD_FORGE_WEB_IMAGE`.
- Stores PostgreSQL and Elasticsearch data in persistent Docker volumes.
- Publishes Web on `VITE_WEB_PORT`, default `8080`.
- Publishes API on `WORLD_FORGE_API_HOST_PORT`, default `8081`.
- Keeps PostgreSQL and Elasticsearch on a private internal Docker network.
- Does not publish Elasticsearch to the host.
- Requires `VITE_API_BASE_URL` at Web build time because the current Web image does not proxy `/api/*`.

The compose-managed Elasticsearch service uses single-node settings and disables Elasticsearch security because it is not published outside Docker. For internet-facing production, keep Elasticsearch behind the API only and prefer a managed or otherwise secured Elasticsearch deployment.

Prepare production values:

```powershell
Copy-Item .env.production.example .env.production
```

Edit `.env.production` before deploying:

- Replace `WORLD_FORGE_DB_USER`.
- Replace `WORLD_FORGE_DB_PASSWORD`.
- Replace `WORLD_FORGE_JWT_SECRET` with a long random secret.
- Set `VITE_API_BASE_URL` to the public API origin that browsers can reach.
- Set `WORLD_FORGE_CORS_ALLOWED_ORIGINS` to the exact public Web origin.
- Do not set `WORLD_FORGE_CORS_ALLOWED_ORIGINS=*`; wildcard CORS is rejected by the API.
- Keep `WORLD_FORGE_JPA_DDL_AUTO=validate`.
- Keep `WORLD_FORGE_ADMIN_ENABLED=false` except during a protected maintenance window.

Validate the compose file without starting containers:

```powershell
docker compose --env-file .env.production.example -f infra/docker-compose.prod.yml config
```

Build and start production-like services:

```powershell
# Required when building frontend images from source on the VM.
# Activate Emscripten for the current shell first; Windows example:
& "C:\emsdk\emsdk_env.ps1"
em++ --version

npm run wasm:build
docker compose --env-file .env.production -f infra/docker-compose.prod.yml up --build -d
```

On Linux/macOS, replace the Windows activation command with:

```bash
source /path/to/emsdk/emsdk_env.sh
em++ --version
```

Check service state:

```powershell
docker compose --env-file .env.production -f infra/docker-compose.prod.yml ps
Invoke-RestMethod "http://localhost:8081/api/health"
Invoke-WebRequest "http://localhost:8080/editor"
Invoke-WebRequest "http://localhost:8080/wasm/world_forge_engine.wasm"
```

Stop services without deleting persisted data:

```powershell
docker compose --env-file .env.production -f infra/docker-compose.prod.yml down
```

Delete persisted production-like data only when intentionally resetting the environment:

```powershell
docker compose --env-file .env.production -f infra/docker-compose.prod.yml down -v
```

To deploy prebuilt images instead of building on the VM:

```powershell
$env:WORLD_FORGE_API_IMAGE="registry.example.com/world-forge-api:0.1.0"
$env:WORLD_FORGE_WEB_IMAGE="registry.example.com/world-forge-web:0.1.0"
docker compose --env-file .env.production -f infra/docker-compose.prod.yml pull
docker compose --env-file .env.production -f infra/docker-compose.prod.yml up -d --no-build
```

The file still contains `build:` sections for single-VM source deployments. The `image:` keys define the resulting tags and can also point at pushed images.

Production compose reindex:

1. Temporarily set these values in `.env.production`:

```txt
WORLD_FORGE_ADMIN_ENABLED=true
WORLD_FORGE_ADMIN_TOKEN=<strong-maintenance-token>
```

2. Recreate the API container so it reads the maintenance env:

```powershell
docker compose --env-file .env.production -f infra/docker-compose.prod.yml up -d --no-deps --build api
```

3. Run reindex through the API, not Elasticsearch:

```powershell
.\scripts\reindex-search.ps1 -ApiBaseUrl "http://localhost:8081" -AdminToken "<strong-maintenance-token>"
```

4. Disable admin again and recreate API:

```txt
WORLD_FORGE_ADMIN_ENABLED=false
```

```powershell
docker compose --env-file .env.production -f infra/docker-compose.prod.yml up -d --no-deps --build api
```

Elasticsearch remains private during this flow. Browsers and maintenance clients must use Spring Boot APIs.

## Build Order

Use this order for a release build:

```powershell
npm install
npm run shared:build
npm run wasm-wrapper:build
& "C:\emsdk\emsdk_env.ps1"
em++ --version
npm run wasm:build
npm run web:build
npm run api:build
```

The same `npm run wasm:build`, `npm run api:build`, and `npm run api:test` commands are intended to work on Windows and Linux/macOS after the required toolchain is installed.

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

Build the frontend Docker image from the repository root. The root build context is required because the web app depends on workspace packages in `packages/shared` and `engine/wasm-engine/ts`:

```powershell
npm run wasm:build
docker build -f apps/web/Dockerfile -t world-forge-web:local .
```

For a separate API origin, pass `VITE_API_BASE_URL` as a Docker build argument. Vite embeds this value at build time:

```powershell
npm run wasm:build
docker build -f apps/web/Dockerfile -t world-forge-web:local --build-arg VITE_API_BASE_URL="https://api.example.com" .
```

Run the static container locally:

```powershell
docker run --rm --name world-forge-web -p 8081:8080 world-forge-web:local
```

The web container listens on port `8080` internally. The example maps host port `8081` to container port `8080`.

The container uses `apps/web/nginx.conf`:

- `/editor`, `/me/worlds`, `/maps/{projectId}`, `/gallery`, `/explore`, and `/world/{worldInstanceId}` use SPA fallback to `index.html`.
- `/wasm/world_forge_engine.js` and `/wasm/world_forge_engine.wasm` are served as static files.
- `.wasm` is served with `application/wasm` through nginx's bundled `mime.types`.
- `/api/*` is not handled by the static container. In same-origin production, route `/api/*` to Spring Boot before requests reach the web container.

Verify the static container:

```powershell
Invoke-WebRequest "http://localhost:8081/editor"
Invoke-WebRequest "http://localhost:8081/me/worlds"
Invoke-WebRequest "http://localhost:8081/maps/example-project-id"
Invoke-WebRequest "http://localhost:8081/gallery"
Invoke-WebRequest "http://localhost:8081/world/example-world-id"
Invoke-WebRequest "http://localhost:8081/wasm/world_forge_engine.js"
Invoke-WebRequest "http://localhost:8081/wasm/world_forge_engine.wasm"
```

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
& "C:\emsdk\emsdk_env.ps1"
em++ --version
npm run wasm:build
```

Direct script entry points are also available when needed:

```powershell
npm run wasm:build:ps
```

```bash
npm run wasm:build:sh
```

If emsdk is not installed on Windows:

```powershell
git clone https://github.com/emscripten-core/emsdk.git C:\emsdk
cd C:\emsdk
.\emsdk.bat install latest
.\emsdk.bat activate latest
& "C:\emsdk\emsdk_env.ps1"
em++ --version
cd "C:\World Instance"
```

Linux/macOS shells should source the active emsdk environment before running the same build:

```bash
source /path/to/emsdk/emsdk_env.sh
em++ --version
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

The web Dockerfile enforces this by failing the build if the source artifacts are missing from:

```txt
apps/web/public/wasm/world_forge_engine.js
apps/web/public/wasm/world_forge_engine.wasm
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

Build the API Docker image from the repository root. The Docker build context is `apps/api` because the Spring Boot project is self-contained:

```powershell
docker build -f apps/api/Dockerfile -t world-forge-api:local apps/api
```

Run the API container against local Docker Compose PostgreSQL and Elasticsearch:

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

The container listens on `SERVER_PORT` internally. The example maps host port `8080` to container port `8080` with `-p 8080:8080`. The image healthcheck calls `GET /api/health` inside the container. Verify from the host with:

```powershell
Invoke-RestMethod "http://localhost:8080/api/health"
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
WORLD_FORGE_JPA_DDL_AUTO=update
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
| `VITE_API_BASE_URL` | Required for production compose and cross-origin builds | API origin for browser requests. Leave unset only for same-origin `/api` builds outside `docker-compose.prod.yml`. |
| `VITE_WEB_PORT` | No | Frontend dev/static host port used by local/deployment scripts. Current Vite default is `5173` unless a command passes `--port`. |
| `WORLD_FORGE_WEB_IMAGE` | No | Image tag used by production compose for the Web container. |

Spring Boot runtime variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | No | unset | Runtime profile marker such as `local` or `production`. |
| `SERVER_PORT` | No | `8080` | Spring Boot HTTP port. |
| `WORLD_FORGE_API_HOST_PORT` | No | `8081` | Host port used by production compose to publish the API. |
| `WORLD_FORGE_API_IMAGE` | No | `world-forge-api:prod` | Image tag used by production compose for the API container. |
| `WORLD_FORGE_DB_NAME` | No | `world_forge` | PostgreSQL database name used by compose-managed PostgreSQL. |
| `WORLD_FORGE_DB_URL` | Yes | `jdbc:postgresql://localhost:5432/world_forge` | PostgreSQL JDBC URL. |
| `WORLD_FORGE_DB_USER` | Yes | `world_forge` | PostgreSQL username. |
| `WORLD_FORGE_DB_PASSWORD` | Yes | `world_forge_dev` | PostgreSQL password. |
| `WORLD_FORGE_JPA_DDL_AUTO` | Yes | `validate` | Hibernate DDL mode. Use `validate` in production. |
| `WORLD_FORGE_FLYWAY_ENABLED` | Yes | `true` | Enables Flyway migrations. |
| `WORLD_FORGE_ELASTICSEARCH_URL` | Yes when search enabled | `http://localhost:9200` | Elasticsearch URL. |
| `WORLD_FORGE_ELASTICSEARCH_JAVA_OPTS` | No | `-Xms1g -Xmx1g` | JVM heap sizing for compose-managed Elasticsearch. |
| `WORLD_FORGE_SEARCH_ENABLED` | Yes | `true` | Enables real Elasticsearch indexing/search. |
| `WORLD_FORGE_SEARCH_INDEX_NAME` | Yes | `world_forge_maps` | Elasticsearch index name. |
| `WORLD_FORGE_ADMIN_ENABLED` | No | `false` | Enables admin maintenance endpoints such as reindex. |
| `WORLD_FORGE_ADMIN_TOKEN` | Only if admin enabled | empty | Token required in `X-World-Forge-Admin-Token`. |
| `WORLD_FORGE_JWT_SECRET` | Yes | local dev default | HMAC-SHA256 JWT signing secret. Must be strong in production. |
| `WORLD_FORGE_JWT_ISSUER` | Yes | `world-forge-api` | JWT issuer claim. |
| `WORLD_FORGE_JWT_TTL_SECONDS` | Yes | `3600` | Access token lifetime in seconds. |
| `WORLD_FORGE_CORS_ALLOWED_ORIGINS` | Required for cross-origin frontend | empty | Comma-separated exact frontend origins. Wildcards are rejected. |

WASM artifact path:

```txt
/wasm/world_forge_engine.js
/wasm/world_forge_engine.wasm
```

The current frontend does not read an environment variable for the WASM artifact path. Build with `npm run wasm:build` and serve the files above from the deployed frontend origin.

Local and production differences:

- Local uses safe development placeholders and may use `WORLD_FORGE_JPA_DDL_AUTO=update` to bootstrap or heal local Docker volumes.
- Production must use `WORLD_FORGE_JPA_DDL_AUTO=validate` with Flyway migrations.
- Local may enable `WORLD_FORGE_ADMIN_ENABLED=true` for reindex testing.
- Production should keep `WORLD_FORGE_ADMIN_ENABLED=false` except during a protected maintenance window.
- Local `VITE_API_BASE_URL` can stay empty for Vite proxy/same-origin development.
- Production compose requires `VITE_API_BASE_URL` because the static web image embeds the API origin at build time.
- No WASM path environment variable is currently consumed; `/wasm/world_forge_engine.js` and `/wasm/world_forge_engine.wasm` are the fixed public artifact paths.

Recommended production values:

```txt
SPRING_PROFILES_ACTIVE=production
SERVER_PORT=8080
WORLD_FORGE_API_HOST_PORT=8081
WORLD_FORGE_JPA_DDL_AUTO=validate
WORLD_FORGE_FLYWAY_ENABLED=true
WORLD_FORGE_SEARCH_ENABLED=true
WORLD_FORGE_ADMIN_ENABLED=false
WORLD_FORGE_JWT_ISSUER=world-forge-api
WORLD_FORGE_JWT_TTL_SECONDS=3600
WORLD_FORGE_CORS_ALLOWED_ORIGINS=https://worldforge.example.com
VITE_API_BASE_URL=https://api.worldforge.example.com
```

## Health Checks

The API exposes a lightweight deployment health endpoint:

```txt
GET /api/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "world-forge-api",
  "time": "2026-04-29T00:00:00Z"
}
```

This endpoint is intended for container and load-balancer health checks. It does not require authentication and is not a map generation, database migration, or simulation endpoint.

The Docker configurations use the same endpoint:

```txt
apps/api/Dockerfile: GET http://localhost:${SERVER_PORT}/api/health
infra/docker-compose.local.yml: GET http://localhost:${SERVER_PORT}/api/health
infra/docker-compose.prod.yml: GET http://localhost:${SERVER_PORT}/api/health
```

The Web container health check uses its static nginx endpoint:

```txt
GET /health
```

PostgreSQL and Elasticsearch readiness are checked separately in compose. The API service starts after those services report healthy in local and production compose.

Manual checks:

```powershell
Invoke-RestMethod "http://localhost:8080/api/health" # local full-stack
Invoke-RestMethod "http://localhost:8081/api/health" # production compose default
Invoke-WebRequest "http://localhost:5173/health"      # local web container
Invoke-WebRequest "http://localhost:8080/health"      # production web container default
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
- Use exact origins only, for example `https://worldforge.example.com`.
- Do not use wildcard CORS with bearer-token APIs; any origin containing `*` fails API startup.
- Allow `Authorization` and `Content-Type`.
- Allow `X-World-Forge-Admin-Token` only for protected maintenance clients.
- The API CORS config allows methods used by the app: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`.
- Multiple cross-origin frontends can be listed with commas, with no wildcard patterns.

Example:

```powershell
$env:VITE_API_BASE_URL="https://api.worldforge.example.com"
$env:WORLD_FORGE_CORS_ALLOWED_ORIGINS="https://worldforge.example.com"
```

Multiple exact origins:

```powershell
$env:WORLD_FORGE_CORS_ALLOWED_ORIGINS="https://worldforge.example.com,https://staging.worldforge.example.com"
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

The repository includes maintenance scripts:

```txt
scripts/reindex-search.ps1
scripts/reindex-search.sh
```

Both scripts call the Spring Boot endpoint:

```txt
POST /api/admin/search/maps/reindex
```

They never call Elasticsearch directly. The admin token is supplied at runtime and must not be hardcoded.

Enable admin only in a protected maintenance context:

```powershell
$env:WORLD_FORGE_ADMIN_ENABLED="true"
$env:WORLD_FORGE_ADMIN_TOKEN="<strong-maintenance-token>"
cd apps/api
.\gradlew.bat bootRun
```

Run reindex:

```powershell
.\scripts\reindex-search.ps1 -ApiBaseUrl "http://localhost:8080" -AdminToken "<strong-maintenance-token>"
```

Linux/macOS:

```bash
bash scripts/reindex-search.sh --api-base-url "http://localhost:8080" --admin-token "$WORLD_FORGE_ADMIN_TOKEN"
```

Expected response fields:

```txt
indexName
publicProjects
indexedDocuments
skippedProjects
rebuiltAt
```

Script output prints:

```txt
Index
Public projects
Indexed documents
Skipped projects
Rebuilt at
```

Failure behavior:

- HTTP failures return a non-zero exit code.
- Missing API base URL or admin token returns a non-zero exit code.
- Unexpected response shape returns a non-zero exit code.

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
- Build the web image with repository root as Docker context: `docker build -f apps/web/Dockerfile ... .`.
- Use `--build-arg VITE_API_BASE_URL=...` only for split frontend/API origins.
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
- Confirm the browser calls Spring Boot `/api/search/*`; it must not call Elasticsearch directly.
- Monitor API logs during publish/private transitions and reindex.

## Smoke Test Procedure

Use the API smoke test scripts after deploying. They create a uniquely named test user and map using a `WF-SMOKE` prefix, verify private search hiding before publish, publish the map, run reindex through Spring Boot, verify public search, and verify facets. They do not delete production data.

PowerShell:

```powershell
.\scripts\smoke-test-api.ps1 `
  -ApiBaseUrl "https://api.worldforge.example.com" `
  -AdminToken "<strong-maintenance-token>" `
  -Prefix "WF-SMOKE"
```

Bash:

```bash
bash scripts/smoke-test-api.sh \
  --api-base-url "https://api.worldforge.example.com" \
  --admin-token "$WORLD_FORGE_ADMIN_TOKEN" \
  --prefix "WF-SMOKE"
```

The scripts check:

- API health: `GET /api/health`
- Signup: `POST /api/auth/signup`
- Login: `POST /api/auth/login`
- Private map save: `POST /api/maps`
- Private map search hiding: `GET /api/search/maps`
- Publish: `PATCH /api/maps/{projectId}`
- Reindex: `POST /api/admin/search/maps/reindex`
- Published map search: `GET /api/search/maps`
- Facets: `GET /api/search/maps/facets`

Script requirements:

- `WORLD_FORGE_ADMIN_ENABLED=true` on the API during the smoke test.
- The supplied admin token must match `WORLD_FORGE_ADMIN_TOKEN`.
- Bash variant requires `curl` and `python3`.
- The smoke script calls Spring Boot APIs only; it never calls Elasticsearch directly.

For local production compose defaults:

```powershell
.\scripts\smoke-test-api.ps1 `
  -ApiBaseUrl "http://localhost:8081" `
  -AdminToken "<strong-maintenance-token>"
```

Disable admin endpoints again after smoke testing:

```txt
WORLD_FORGE_ADMIN_ENABLED=false
```

Manual browser smoke checks can follow the API script.

Set manual check variables:

```powershell
$api = "https://api.worldforge.example.com"
$web = "https://worldforge.example.com"
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
.\scripts\reindex-search.ps1 -ApiBaseUrl $api -AdminToken "<strong-maintenance-token>"
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
