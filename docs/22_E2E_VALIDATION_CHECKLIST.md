# MVP End-to-End Validation Checklist

This checklist validates the current user-facing World Forge flow after Auth/Ownership, Gallery/Explore, Map Detail, My Worlds, World Instance movement, and search reindex work.

The checklist stays ASCII-only so it remains readable in Windows PowerShell, Git diffs, and Codex reviews without encoding flags.

## Scope

- Browser map generation uses the C++/WebAssembly artifact when available.
- TypeScript generation is only a labeled fallback when WASM cannot load.
- Spring Boot stores users, map projects, map versions, world instances, entity state, publish state, and search projection updates.
- PostgreSQL is the source of truth.
- Elasticsearch contains only rebuildable public-map projections.
- World Instance player movement and entity wander run in the browser.
- The browser calls Spring Boot search APIs, not Elasticsearch directly.
- Raw Elasticsearch Query DSL is never sent by browser clients.

## Common Setup

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
$env:WORLD_FORGE_ADMIN_TOKEN="manual-admin-token"
.\gradlew.bat bootRun
```

Run the frontend in another terminal from the repository root:

```powershell
npm run web:dev
```

Common variables for optional API checks:

```powershell
$api = "http://localhost:8080"
$web = "http://localhost:5173"
```

After signup or login, keep a bearer header:

```powershell
$headers = @{ Authorization = "Bearer <token>" }
```

## 1. Sign Up

- Prerequisites: PostgreSQL is running; API and frontend are running.
- Steps:
  - Open `$web/signup`.
  - Enter a unique email, password with at least 8 characters, and nickname.
  - Submit the form.
  - Optional API check:

```powershell
$signup = Invoke-RestMethod -Method Post "$api/api/auth/signup" -ContentType "application/json" -Body (@{
  email = "e2e-user@example.com"
  password = "Password123!"
  nickname = "E2E User"
} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($signup.token)" }
```

- Expected Result: The browser navigates to `/editor`; API returns `token`, `tokenType = Bearer`, and `user`.
- If Fails Check:
  - API: `POST /api/auth/signup`
  - UI: `apps/web/src/pages/AuthPage.tsx`
  - API client: `apps/web/src/world/worldApi.ts`
  - Backend: `apps/api/src/main/java/com/worldforge/api/service/AuthService.java`
  - Tests: `apps/api/src/test/java/com/worldforge/api/AuthApiIntegrationTests.java`

## 2. Login

- Prerequisites: A user account exists.
- Steps:
  - Open `$web/login`.
  - Enter the email and password.
  - Submit the form.
  - Optional API check:

```powershell
$login = Invoke-RestMethod -Method Post "$api/api/auth/login" -ContentType "application/json" -Body (@{
  email = "e2e-user@example.com"
  password = "Password123!"
} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod "$api/api/me" -Headers $headers
```

- Expected Result: The browser navigates to `/editor`; `GET /api/me` returns the current user.
- If Fails Check:
  - API: `POST /api/auth/login`, `GET /api/me`
  - UI: `apps/web/src/pages/AuthPage.tsx`, `apps/web/src/components/AuthStatus.tsx`
  - API client: `apps/web/src/world/worldApi.ts`
  - Backend: `apps/api/src/main/java/com/worldforge/api/auth/JwtAuthenticationFilter.java`

## 3. Generate Map

- Prerequisites: Frontend is running; `/editor` is open.
- Steps:
  - Set width, height, seed, features, algorithms, and parameters.
  - Click `Generate`.
- Expected Result: A non-empty map renders, stats populate, and generation status returns to ready.
- If Fails Check:
  - UI: `apps/web/src/pages/EditorPage.tsx`
  - Controls: `apps/web/src/components/ControlPanel.tsx`
  - Engine adapter: `apps/web/src/editor/engineAdapter.ts`
  - Shared types: `packages/shared/src/types.ts`

## 4. WASM Runtime Check

- Prerequisites: `npm run wasm:build` completed in an Emscripten-activated shell.
- Steps:
  - Open `$web/editor`.
  - Check the `Engine` badge before and after `Generate`.
  - Open browser DevTools Network and filter for `world_forge_engine.js` or `.wasm`.
- Expected Result: The UI shows `WASM`; artifacts are loaded from `/wasm`; fallback is not shown during normal generation.
- If Fails Check:
  - Artifact path: `apps/web/public/wasm/world_forge_engine.js`, `apps/web/public/wasm/world_forge_engine.wasm`
  - Build script: `engine/wasm-engine/scripts/build-wasm.ps1`
  - Wrapper: `engine/wasm-engine/ts/src/engine.ts`
  - Frontend adapter: `apps/web/src/editor/engineAdapter.ts`

## 5. mapHash Check

- Prerequisites: `/editor` can generate a map.
- Steps:
  - Generate a map with a fixed seed and recipe.
  - Record the `mapHash`.
  - Click `Generate` again without changing controls.
  - Change only the seed and generate once more.
- Expected Result: Same seed and recipe produce the same `mapHash`; a different seed produces a different `mapHash`.
- If Fails Check:
  - Stats panel: `apps/web/src/components/StatsPanel.tsx`
  - WASM engine: `engine/wasm-engine/src/engine.cpp`
  - Wrapper tests: `engine/wasm-engine/ts/src/engine.test.ts`
  - Shared validation: `packages/shared/src/validation.ts`

## 6. Save Map

- Prerequisites: User is logged in; a map has been generated.
- Steps:
  - Enter a title and optional description in `/editor`.
  - Click `Save Private` or `Save Public`.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/me/maps" -Headers $headers
```

- Expected Result: Save succeeds; the project has a `currentVersion` with recipe, stats, and `mapHash`.
- If Fails Check:
  - API: `POST /api/maps`
  - UI: `apps/web/src/pages/EditorPage.tsx`
  - API client: `apps/web/src/world/worldApi.ts`
  - Backend: `apps/api/src/main/java/com/worldforge/api/service/MapPersistenceService.java`
  - Validation: `apps/api/src/main/java/com/worldforge/api/service/RecipePayloadValidator.java`

## 7. My Worlds List

- Prerequisites: User is logged in; at least one map is saved.
- Steps:
  - Open `$web/me/worlds` or `$web/dashboard`.
  - Click `Refresh` if needed.
- Expected Result: `Map Projects` shows owned maps with visibility, size, creature count, reachable ratio, dates, and actions. `World Instances` shows owned world snapshots when they exist.
- If Fails Check:
  - API: `GET /api/me/maps`, `GET /api/me/world-instances`
  - UI: `apps/web/src/pages/DashboardPage.tsx`
  - API client: `apps/web/src/world/worldApi.ts`
  - Backend: `MapPersistenceService.listMyMaps`, `WorldInstanceService.listMyWorlds`

## 8. Map Detail

- Prerequisites: A saved map project exists.
- Steps:
  - From My Worlds or Gallery, click `Open Detail` or `Details`.
  - Confirm the URL is `/maps/{projectId}`.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/maps/<project-id>" -Headers $headers
```

- Expected Result: Detail shows title, description, owner, visibility, map type, seed, size, engine version, features, algorithms, params, stats, living stats, `mapHash`, preview, and dates. Owner-only metadata actions appear only for the owner.
- If Fails Check:
  - API: `GET /api/maps/{projectId}`
  - UI: `apps/web/src/pages/MapDetailPage.tsx`
  - API client: `apps/web/src/world/worldApi.ts`
  - Backend: `MapPersistenceService.getMap`

## 9. Create World Instance

- Prerequisites: A saved map has a `currentVersionId`; user is logged in.
- Steps:
  - From `/editor`, click `Open World` after saving, or from My Worlds/Map Detail click `Create World` or `Create World Instance`.
  - Optional API check:

```powershell
$world = Invoke-RestMethod -Method Post "$api/api/world-instances" -Headers $headers -ContentType "application/json" -Body (@{
  mapVersionId = "<current-version-id>"
  name = "E2E World"
  worldTime = 0
  entities = @()
} | ConvertTo-Json -Depth 10)
```

- Expected Result: Browser navigates to `/world/{worldInstanceId}`; API returns `worldInstance` and `entities`.
- If Fails Check:
  - API: `POST /api/world-instances`
  - UI: `apps/web/src/pages/EditorPage.tsx`, `apps/web/src/pages/DashboardPage.tsx`, `apps/web/src/pages/MapDetailPage.tsx`
  - Backend: `apps/api/src/main/java/com/worldforge/api/service/WorldInstanceService.java`

## 10. Player Movement

- Prerequisites: `/world/{worldInstanceId}` is open and the map/state have loaded.
- Steps:
  - Use Arrow keys to move the player.
  - Watch the player dot and the sidebar coordinates.
- Expected Result: Player position changes on walkable tiles; movement is client-side; world time increases.
- If Fails Check:
  - UI: `apps/web/src/pages/WorldPage.tsx`
  - Canvas: `apps/web/src/world/WorldCanvas.tsx`
  - Logic: `apps/web/src/world/worldState.ts`
  - Tests: `apps/web/src/world/worldState.test.ts`

## 11. Entity Wander

- Prerequisites: `/world/{worldInstanceId}` is open with generated entities.
- Steps:
  - Wait 2 to 5 seconds.
  - Observe non-player entity dots.
  - Switch views if 3D preview is available and confirm positions remain consistent.
- Expected Result: Entity wander runs in the browser, avoids blocked tiles, uses the same saved entity state, and does not require server simulation ticks.
- If Fails Check:
  - UI timer: `apps/web/src/pages/WorldPage.tsx`
  - Logic: `worldState.tickWanderingEntities`
  - Shared DTOs: `packages/shared/src/types.ts`
  - Backend storage only: `WorldInstanceService.saveWorldState`

## 12. collisionMap Movement Restriction

- Prerequisites: World is open with visible water, trees, cave walls, or steep terrain.
- Steps:
  - Move the player toward a visibly blocked tile.
  - Move across road, grass, and forest tiles when visible.
  - Observe whether movement is blocked or slowed.
- Expected Result: Player cannot enter blocked tiles. Water, tree, and cave-wall tiles are blocked. Road has lower movement cost than grass, forest has higher movement cost, and height/jump/slope restrictions use the same movement rule as 3D preview.
- If Fails Check:
  - Logic: `worldState.canEnterTile`, `worldState.stepEntityToward`
  - Source data: `collisionMap`, `costMap`, `terrainMap`, `heightMap`, `objectList`
  - Tests: `apps/web/src/world/worldState.test.ts`

## 13. Portal and Cave Movement

- Prerequisites: Map was generated with caves enabled; `portalList` is non-empty.
- Steps:
  - Move the player onto a cave entrance marker.
  - Click `Use Portal`.
  - Confirm the layer changes to cave.
  - Move to the return portal and click `Use Portal` again.
- Expected Result: Player `layerId` changes between `surface` and `cave`; coordinates move to the portal target; state remains compatible with save/load.
- If Fails Check:
  - Logic: `worldState.portalAt`, `worldState.usePortal`
  - UI: `apps/web/src/pages/WorldPage.tsx`
  - Canvas markers: `apps/web/src/world/WorldCanvas.tsx`
  - WASM output: `MapData.portalList`

## 14. Save and Restore State

- Prerequisites: World is open; player has moved; at least one entity has wandered.
- Steps:
  - Click `Save` in `/world/{worldInstanceId}`.
  - Reload the browser tab or leave and reopen `/world/{worldInstanceId}`.
  - Optional API checks:

```powershell
Invoke-RestMethod "$api/api/world-instances/<world-instance-id>/state" -Headers $headers
```

- Expected Result: Player/entity positions, layer ids, world time, behavior/state, movement cost multiplier, jump height, max slope, and metadata restore after reload.
- If Fails Check:
  - API: `GET /api/world-instances/{id}/state`, `PUT /api/world-instances/{id}/state`
  - UI load/save: `apps/web/src/pages/WorldPage.tsx`
  - Serialization: `worldState.serializeWorldEntities`, `worldState.fromEntityStateDto`
  - Backend: `WorldInstanceService.saveWorldState`

## 15. Public Publish

- Prerequisites: User owns a private saved map; Elasticsearch is running.
- Steps:
  - Open `/me/worlds`.
  - Click `Publish` on a private map.
  - Optional API check:

```powershell
Invoke-RestMethod -Method Patch "$api/api/maps/<project-id>" -Headers $headers -ContentType "application/json" -Body (@{
  visibility = "PUBLIC"
} | ConvertTo-Json)
```

- Expected Result: Map visibility changes to `PUBLIC`; search projection sync is triggered after the PostgreSQL update.
- If Fails Check:
  - API: `PATCH /api/maps/{projectId}`
  - UI: `apps/web/src/pages/DashboardPage.tsx`
  - Backend: `MapPersistenceService.updateMap`
  - Projection: `MapSearchProjectionService.syncProject`

## 16. Explore Search

- Prerequisites: At least one map is public; Elasticsearch is healthy.
- Steps:
  - Open `$web/gallery` or `$web/explore`.
  - Search by keyword, title, or description.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/search/maps?keyword=<public-title>"
```

- Expected Result: Public maps appear as result cards with thumbnail or placeholder, title, map type, size, features, stats summary, living stats summary, owner nickname, and created date.
- If Fails Check:
  - API: `GET /api/search/maps`
  - UI: `apps/web/src/pages/GalleryPage.tsx`
  - API client: `apps/web/src/world/worldApi.ts`
  - Backend: `apps/api/src/main/java/com/worldforge/api/search/MapSearchService.java`
  - Elasticsearch client: `apps/api/src/main/java/com/worldforge/api/search/HttpMapSearchIndexClient.java`

## 17. Feature Filter

- Prerequisites: Gallery is open; public maps with different feature sets exist.
- Steps:
  - Toggle `trees`, `roads`, `caves`, `rivers`, or `villages`.
  - Watch results update.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/search/maps?features=trees,roads"
```

- Expected Result: Results include only public maps whose indexed features match the selected filter set.
- If Fails Check:
  - UI filter state: `apps/web/src/pages/GalleryPage.tsx`
  - Parser: `apps/api/src/main/java/com/worldforge/api/search/MapSearchRequestParser.java`
  - Projection: `MapSearchProjectionService.features`

## 18. Algorithm Filter

- Prerequisites: Gallery is open; public maps with different algorithms exist.
- Steps:
  - Select terrain, cave, or road algorithm filters.
  - Watch results update.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/search/maps?terrainAlgorithm=noise-island&caveAlgorithm=cellular-automata&roadAlgorithm=astar"
```

- Expected Result: Results match the selected algorithm fields and remain limited to public maps.
- If Fails Check:
  - UI: `apps/web/src/pages/GalleryPage.tsx`
  - Parser: `MapSearchRequestParser`
  - Document projection: `MapSearchProjectionService.toDocument`

## 19. Stats Filter

- Prerequisites: Gallery is open; public maps have stats values.
- Steps:
  - Set min/max forest, mountain, water, or land ratio filters.
  - Watch results update.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/search/maps?minForestRatio=0.2&minWaterRatio=0.05&minLandRatio=0.5"
```

- Expected Result: Results satisfy the numeric stats ranges.
- If Fails Check:
  - UI: `apps/web/src/pages/GalleryPage.tsx`
  - Parser: `MapSearchRequestParser`
  - Validation: `RecipePayloadValidator`
  - ES query builder: `HttpMapSearchIndexClient`

## 20. livingStats Filter

- Prerequisites: Gallery is open; public maps have living stats.
- Steps:
  - Set min creature count, min reachable ratio, or min portal count.
  - Watch results update.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/search/maps?minCreatureCount=1&minReachableAreaRatio=0.5&minPortalCount=1"
```

- Expected Result: Results satisfy living stats ranges; cards display creature count, reachable ratio, and portal count.
- If Fails Check:
  - UI: `apps/web/src/pages/GalleryPage.tsx`
  - Projection: `MapSearchProjectionService.livingStats`
  - Parser: `MapSearchRequestParser`
  - ES client: `HttpMapSearchIndexClient`
  - Tests: `apps/api/src/test/java/com/worldforge/api/SearchApiIntegrationTests.java`

## 21. Facets

- Prerequisites: Gallery is open; Elasticsearch has public documents.
- Steps:
  - Inspect the Gallery facet side panel.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/search/maps/facets"
```

- Expected Result: Facets show counts for map type, features, terrain algorithms, cave algorithms, road algorithms, and living map buckets where data exists.
- If Fails Check:
  - API: `GET /api/search/maps/facets`
  - UI: `apps/web/src/pages/GalleryPage.tsx`
  - Response DTO: `MapSearchFacetsResponse`
  - ES aggregations: `HttpMapSearchIndexClient.facets`

## 22. Private Map Is Not Exposed

- Prerequisites: At least one private map exists with a recognizable title.
- Steps:
  - Search by the private title in `/gallery`.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/search/maps?keyword=<private-title>"
```

- Expected Result: Private map is not returned. UI result cards do not display private state because search returns only public maps.
- If Fails Check:
  - Projection guard: `MapSearchProjectionService.syncProject`
  - Visibility update: `MapPersistenceService.updateMap`
  - Search tests: `SearchApiIntegrationTests.indexesOnlyPublicMapsAndSupportsSafeFilters`
  - Reindex tests: `SearchApiIntegrationTests.reindexesPublicMapsFromPostgresAndDropsStalePrivateDocuments`

## 23. Elasticsearch Reindex

- Prerequisites: API is running with `WORLD_FORGE_ADMIN_ENABLED=true`; `WORLD_FORGE_ADMIN_TOKEN` is set; PostgreSQL contains public and private maps.
- Steps:

```powershell
Invoke-RestMethod -Method Post "$api/api/admin/search/maps/reindex" -Headers @{
  "X-World-Forge-Admin-Token" = "manual-admin-token"
}
```

- Expected Result: Response includes `indexName`, `publicProjects`, `indexedDocuments`, `skippedProjects`, and `rebuiltAt`. Only public maps are indexed.
- If Fails Check:
  - API: `POST /api/admin/search/maps/reindex`
  - Controller: `apps/api/src/main/java/com/worldforge/api/controller/AdminSearchController.java`
  - Service: `apps/api/src/main/java/com/worldforge/api/search/MapSearchReindexService.java`
  - Index client: `MapSearchIndexClient.replaceAll`

## 24. Search After Reindex

- Prerequisites: Reindex completed successfully.
- Steps:
  - Search again for a public map title.
  - Search again for a private map title.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/search/maps?keyword=<public-title>"
Invoke-RestMethod "$api/api/search/maps?keyword=<private-title>"
```

- Expected Result: Public map still appears; private map does not appear; facets remain populated from public documents.
- If Fails Check:
  - Source query: `MapProjectRepository.findByVisibilityOrderByUpdatedAtDesc`
  - Reindex service: `MapSearchReindexService.reindexPublicMaps`
  - ES replacement: `HttpMapSearchIndexClient.replaceAll`
  - Tests: `SearchApiIntegrationTests.reindexesPublicMapsFromPostgresAndDropsStalePrivateDocuments`

## Final Automated Checks

Run from repository root:

```powershell
npm run verify
```

Run release verification only from an Emscripten-activated shell where `em++` is on `PATH`:

```powershell
npm run verify:release
```
