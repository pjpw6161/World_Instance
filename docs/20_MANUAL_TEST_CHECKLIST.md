# MVP Manual Test Checklist

This checklist is intentionally ASCII-only so it stays readable in Windows PowerShell, Git diffs, and Codex reviews without encoding flags.

## Scope

- Browser map generation uses the C++/WebAssembly artifact.
- TypeScript generation fallback is allowed only for development/test and must be labeled as fallback.
- Spring Boot stores maps, versions, publish state, world instances, entity state, and search projection updates.
- PostgreSQL is the source of truth.
- Elasticsearch contains only rebuildable public-map projections.
- World Instance movement and entity wander run in the browser.

## Setup

Run from the repository root:

```powershell
npm install
docker compose -f infra/docker-compose.yml up -d postgres elasticsearch
docker compose -f infra/docker-compose.yml ps
npm run shared:build
npm run wasm-wrapper:build
npm run wasm:build
```

Run the API in one terminal:

```powershell
cd apps/api
$env:WORLD_FORGE_ADMIN_ENABLED="true"
.\gradlew.bat bootRun
```

Run the frontend in another terminal from the repository root:

```powershell
npm run web:dev
```

Common PowerShell variables:

```powershell
$api = "http://localhost:8080"
$web = "http://localhost:5173"
```

## 1. App Startup

Steps:

- Open `http://localhost:5173/editor`.
- Confirm the editor renders.
- Check API health.

```powershell
Invoke-RestMethod "$api/api/health"
```

Pass criteria:

- The editor page loads without a fatal browser console error.
- The health endpoint returns a successful response.

## 2. WASM Map Generation

Steps:

- In `/editor`, confirm the Engine badge says `WASM`.
- Confirm the Engine detail points to `/wasm/world_forge_engine.wasm`.
- Click `Generate`.
- Record the displayed `mapHash`.

Pass criteria:

- The map preview renders.
- Stats update from `pending` to numeric values.
- `mapHash` changes from `pending` to a non-empty hash.
- If the badge says `Fallback`, rebuild with `npm run wasm:build`, refresh the page, and rerun this check.

## 3. Width and Height Changes

Steps:

- Change Width and click `Generate`.
- Change Height and click `Generate`.
- Record each `mapHash`.

Pass criteria:

- The preview changes shape or rendered contents.
- `mapHash` changes when the recipe size changes.
- No validation error appears for valid sizes.

## 4. Seed Changes

Steps:

- Generate a map with seed `12345`.
- Record `mapHash`.
- Change seed to another valid value.
- Generate again and record `mapHash`.

Pass criteria:

- Different seeds normally produce different `mapHash` values.
- The preview visibly changes.

## 5. Same Seed and Recipe Determinism

Steps:

- Set seed, size, features, algorithms, and parameters to known values.
- Click `Generate` and record `mapHash`.
- Do not change any recipe control.
- Click `Generate` again.

Pass criteria:

- The two `mapHash` values are identical.
- Switching view modes does not change `mapHash`.

## 6. Feature Checkboxes

Steps:

- Toggle `Forests`, `Trees`, `Roads`, `Caves`, `Rivers`, and `Villages` one at a time.
- Click `Generate` after each change.
- Record whether `mapHash`, stats, or preview changes.

Pass criteria:

- Feature state is reflected in the generated result or `mapHash`.
- If a feature has no visible effect yet, record it as a known limitation rather than treating it as verified.

## 7. 2D Terrain View

Steps:

- Generate a map.
- Select `2D Terrain`.

Pass criteria:

- The canvas is not blank.
- Terrain colors correspond to `MapData.terrainMap`.

## 8. Height Map View

Steps:

- Select `Height Map`.

Pass criteria:

- The canvas is not blank.
- Brightness varies with `MapData.heightMap`.

## 9. Side View

Steps:

- Select `Side View`.

Pass criteria:

- The canvas is not blank.
- The profile is rendered from the same generated `MapData`.

## 10. 3D Terrain Preview

Steps:

- Create or open a World Instance from a saved map.
- Select `3D`.
- Switch between `Orbit`, `Top`, and `Side`.

Pass criteria:

- The 3D preview renders non-empty terrain.
- Player and entity markers appear as simple points or spheres.
- The view uses the same World Instance state as the 2D view.

## 11. Save a Map Through the API

The editor does not have save/publish UI yet. Use the API for persistence checks.

Important: World Instance loading now verifies generated `mapHash` against the stored map version. To open `/world/{id}` successfully, first generate the default recipe in `/editor` and paste the displayed `mapHash` below.

```powershell
$mapHash = "<paste-default-recipe-mapHash-from-editor>"

$recipe = @{
  engineVersion = "0.1.0"
  seed = 12345
  width = 256
  height = 256
  features = @{
    mountains = $true
    forests = $true
    trees = $true
    roads = $true
    caves = $false
    rivers = $false
    villages = $true
  }
  algorithms = @{
    terrain = "noise-island"
    cave = "cellular-automata"
    road = "astar"
    objectPlacement = "biome-density"
  }
  params = @{
    waterLevel = 0.38
    mountainLevel = 0.72
    forestDensity = 0.55
    caveDensity = 0.42
    roadComplexity = 0.4
  }
}

$stats = @{
  waterRatio = 0.25
  landRatio = 0.75
  forestRatio = 0.2
  mountainRatio = 0.1
  treeCount = 2
  roadLength = 1
  caveAreaRatio = 0
  villageCount = 1
  blockedRatio = 0.25
  reachableAreaRatio = 0.75
  creatureCount = 4
  livingStats = @{
    creatureCount = 4
    npcCount = 1
    livingDensity = 0.000076
    creatureDensity = 0.000061
  }
  generationTimeMs = 0
}

$map = Invoke-RestMethod -Method Post "$api/api/maps" -ContentType "application/json" -Body (@{
  title = "Manual MVP Public Candidate"
  description = "Manual checklist map"
  recipe = $recipe
  stats = $stats
  mapHash = $mapHash
} | ConvertTo-Json -Depth 20)

$map
```

Pass criteria:

- The response includes `id`, `currentVersionId`, and `currentVersion`.
- `currentVersion.mapHash` equals the hash copied from the editor.

## 12. Map Version List and Detail

```powershell
$version = Invoke-RestMethod -Method Post "$api/api/maps/$($map.id)/versions" -ContentType "application/json" -Body (@{
  recipe = $recipe
  stats = $stats
  mapHash = $mapHash
} | ConvertTo-Json -Depth 20)

Invoke-RestMethod "$api/api/maps/$($map.id)/versions"
Invoke-RestMethod "$api/api/map-versions/$($version.id)"
```

Pass criteria:

- The version list includes the new version.
- Version detail includes `projectId`, `recipe`, `stats`, and `mapHash`.

## 13. Create World Instance

```powershell
$world = Invoke-RestMethod -Method Post "$api/api/world-instances" -ContentType "application/json" -Body (@{
  mapVersionId = $version.id
  name = "Manual MVP World"
  worldTime = 0
  entities = @()
} | ConvertTo-Json -Depth 20)

$worldId = $world.worldInstance.id
$worldId
```

Pass criteria:

- The response includes `worldInstance.id`, `mapVersionId`, `worldTime`, and `lastSavedAt`.
- `mapVersionId` matches the saved version.

## 14. 2D Player Movement

Steps:

- Open `http://localhost:5173/world/<worldId>`.
- Use arrow keys or `W`, `A`, `S`, `D`.

Pass criteria:

- The player dot moves on the map.
- The sidebar player coordinates and world time update.
- If the page reports a `mapHash` mismatch, recreate the API map using the exact recipe and `mapHash` from `/editor`.

## 15. Entity Wander

Steps:

- Stay on the World page for several seconds.
- Watch creature/entity dots and world time.

Pass criteria:

- Entity dots wander in the browser.
- No server-side tick endpoint or polling loop is required for movement.

## 16. CollisionMap Movement Block

Steps:

- Try moving the player into water or another blocked tile.
- Watch the player coordinates.

Pass criteria:

- The player does not enter a tile blocked by `collisionMap`.
- Movement remains client-side.

## 17. State Save and Load

Steps:

- Move the player.
- Click `Save`.
- Click `Reload` or refresh the page.
- Fetch state through the API.

```powershell
Invoke-RestMethod "$api/api/world-instances/$worldId/state"
```

Pass criteria:

- The saved player/entity state is restored after reload.
- The API response includes saved entities.

## 18. Publish Public Map

```powershell
$published = Invoke-RestMethod -Method Patch "$api/api/maps/$($map.id)" -ContentType "application/json" -Body (@{
  visibility = "PUBLIC"
} | ConvertTo-Json -Depth 20)

$published
```

Pass criteria:

- The response has `visibility = PUBLIC`.
- The map is eligible for Elasticsearch indexing.

## 19. Elasticsearch Search

```powershell
Invoke-RestMethod "$api/api/search/maps?keyword=Manual&features=forests,roads&terrainAlgorithm=noise-island&minWidth=128&maxWidth=512"
Invoke-RestMethod "$api/api/search/maps?livingActivity=inhabited&minCreatureCount=4&minReachableAreaRatio=0.7"
```

Pass criteria:

- The public map appears in search results.
- Only safe query parameters are used.

## 20. Elasticsearch Facets

```powershell
Invoke-RestMethod "$api/api/search/maps/facets"
```

Pass criteria:

- The response includes map type, features, algorithms, and living activity facets.
- Counts reflect public indexed maps.

## 21. Similar Maps

```powershell
Invoke-RestMethod "$api/api/search/maps/$($map.id)/similar?size=5"
```

Pass criteria:

- The endpoint returns a safe response without accepting raw Elasticsearch Query DSL.
- The source project itself is not returned as its own similar result.

## 22. Private Map Not Exposed

Create a private map and verify it does not appear in public search.

```powershell
$privateMap = Invoke-RestMethod -Method Post "$api/api/maps" -ContentType "application/json" -Body (@{
  title = "Manual MVP Private Map"
  description = "This map must not appear in public search"
  recipe = $recipe
  stats = $stats
  mapHash = $mapHash
} | ConvertTo-Json -Depth 20)

Invoke-RestMethod "$api/api/search/maps?keyword=Private"
```

Pass criteria:

- The private map is not returned by search.
- If a private map appears in search, it is a release blocker.

## 23. Reindex

Rebuild Elasticsearch from PostgreSQL public maps.

```powershell
Invoke-RestMethod -Method Post "$api/api/admin/search/maps/reindex"
```

Pass criteria:

- The response includes `indexName`, `publicProjects`, `indexedDocuments`, `skippedProjects`, and `rebuiltAt`.
- Public maps remain searchable after reindex.
- Private maps and stale private documents are not searchable after reindex.

## 24. Automated Verification

```powershell
npm run verify
npm run web:lint
cd apps/api
.\gradlew.bat test --tests com.worldforge.api.SearchApiIntegrationTests
```

Pass criteria:

- Shared build/test passes.
- WASM wrapper build/test passes.
- Frontend build/test and lint pass.
- Spring Boot tests pass.
- Docker Compose config validation passes.
