# MVP End-to-End Validation Checklist

This checklist validates the user-facing MVP flow after Auth/Ownership. It is intentionally ASCII-only so it stays readable in Windows PowerShell, Git diffs, and Codex reviews without encoding flags.

## Scope

- Browser map generation uses the C++/WebAssembly artifact.
- Spring Boot stores users, map projects, versions, world instances, entity state, publish state, and search projection updates.
- PostgreSQL is the source of truth.
- Elasticsearch contains only rebuildable public-map projections.
- World Instance movement and entity wander run in the browser.
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

Common variables for API checks:

```powershell
$api = "http://localhost:8080"
$web = "http://localhost:5173"
```

## 1. Sign Up

- Purpose: Confirm a new user can create an account and receive a JWT.
- Prerequisites: API and frontend are running.
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
$signup.token
```

- Expected Result: The browser navigates to `/editor`; API returns `token`, `tokenType = Bearer`, and `user`.
- If Fails Check:
  - UI: `apps/web/src/pages/AuthPage.tsx`
  - API: `POST /api/auth/signup`
  - Backend: `apps/api/src/main/java/com/worldforge/api/service/AuthService.java`
  - Tests: `apps/api/src/test/java/com/worldforge/api/AuthApiIntegrationTests.java`

## 2. Login

- Purpose: Confirm an existing user can authenticate and store a bearer token.
- Prerequisites: User account exists.
- Steps:
  - Open `$web/login`.
  - Enter email and password.
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
  - UI/API client: `apps/web/src/world/worldApi.ts`
  - API: `POST /api/auth/login`, `GET /api/me`
  - Backend: `apps/api/src/main/java/com/worldforge/api/auth/JwtAuthenticationFilter.java`

## 3. Generate Map

- Purpose: Confirm `/editor` generates a map using the browser engine.
- Prerequisites: Frontend is running; `npm run wasm:build` has copied artifacts to `apps/web/public/wasm`.
- Steps:
  - Open `$web/editor`.
  - Confirm the Engine badge says `WASM`.
  - Click `Generate`.
- Expected Result: A map appears, status becomes ready, stats and `mapHash` are populated.
- If Fails Check:
  - UI: `apps/web/src/pages/EditorPage.tsx`
  - Engine adapter: `apps/web/src/editor/engineAdapter.ts`
  - WASM wrapper: `engine/wasm-engine/ts/src/engine.ts`
  - WASM artifact path: `apps/web/public/wasm/world_forge_engine.js`

## 4. Same Seed and Recipe Produce Same mapHash

- Purpose: Confirm deterministic generation.
- Prerequisites: `/editor` can generate maps.
- Steps:
  - Set width, height, seed, features, algorithms, and params.
  - Click `Generate`.
  - Record `mapHash`.
  - Click `Generate` again without changing any controls.
- Expected Result: The second `mapHash` exactly matches the first.
- If Fails Check:
  - UI: `apps/web/src/pages/EditorPage.tsx`
  - Shared validation: `packages/shared/src/validation.ts`
  - WASM engine: `engine/wasm-engine/src/engine.cpp`
  - Tests: `engine/wasm-engine/ts/src/engine.test.ts`

## 5. Different Seed Changes mapHash

- Purpose: Confirm seed affects generated output.
- Prerequisites: A baseline mapHash has been recorded.
- Steps:
  - Change the seed input, or click `Random`.
  - Click `Generate`.
  - Compare the new `mapHash` with the baseline.
- Expected Result: The new `mapHash` is different for a materially different seed.
- If Fails Check:
  - UI: `apps/web/src/components/ControlPanel.tsx`
  - Seed helper: `apps/web/src/editor/editorState.ts`
  - WASM engine: `engine/wasm-engine/src/engine.cpp`

## 6. Feature Checkbox Is Reflected

- Purpose: Confirm feature toggles are included in the recipe and influence supported output.
- Prerequisites: `/editor` is loaded and a user is signed in if saving will be checked.
- Steps:
  - Toggle one or more features such as `Forests`, `Roads`, or `Caves`.
  - Click `Generate`.
  - Save the map as private.
  - API check the stored recipe:

```powershell
$mapId = "<saved-project-id>"
Invoke-RestMethod "$api/api/maps/$mapId" -Headers $headers
```

- Expected Result: `currentVersion.recipe.features` matches the checkbox state. Supported features may also change stats, objects, terrain, or portal data.
- If Fails Check:
  - UI controls: `apps/web/src/components/ControlPanel.tsx`
  - Editor state: `apps/web/src/editor/editorState.ts`
  - Backend validation: `apps/api/src/main/java/com/worldforge/api/service/RecipePayloadValidator.java`

## 7. 2D Terrain View

- Purpose: Confirm the terrain renderer consumes `MapData`.
- Prerequisites: A map has been generated.
- Steps:
  - In `/editor`, select `2D Terrain`.
  - Inspect terrain colors and visible land/water/forest/mountain/road/cave tiles.
- Expected Result: The canvas renders a non-empty 2D terrain map.
- If Fails Check:
  - View shell: `apps/web/src/components/MapViewport.tsx`
  - Renderer: `apps/web/src/renderers/canvasRenderers.tsx`
  - Map data type: `packages/shared/src/types.ts`

## 8. Height Map View

- Purpose: Confirm `heightMap` renders separately from terrain colors.
- Prerequisites: A map has been generated.
- Steps:
  - In `/editor`, select `Height Map`.
  - Compare brightness/height variation with terrain.
- Expected Result: The canvas shows grayscale or height-based visualization.
- If Fails Check:
  - View shell: `apps/web/src/components/MapViewport.tsx`
  - Renderer: `apps/web/src/renderers/canvasRenderers.tsx`
  - WASM output validation: `engine/wasm-engine/ts/src/engine.ts`

## 9. Side View

- Purpose: Confirm side profile rendering is available from the same `MapData`.
- Prerequisites: A map has been generated.
- Steps:
  - In `/editor`, select `Side View`.
  - Inspect the terrain profile.
- Expected Result: The side view renders a profile from the generated height data.
- If Fails Check:
  - View shell: `apps/web/src/components/MapViewport.tsx`
  - Renderer: `apps/web/src/renderers/canvasRenderers.tsx`

## 10. Save Map

- Purpose: Confirm an authenticated user can store a generated map in PostgreSQL.
- Prerequisites: User is logged in; map has been generated.
- Steps:
  - Enter a title and optional description in `/editor`.
  - Click `Save Private`.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/me/maps" -Headers $headers
```

- Expected Result: Save status becomes ready; the map appears under `/maps`; the saved project has `visibility = PRIVATE`.
- If Fails Check:
  - UI: `apps/web/src/pages/EditorPage.tsx`
  - API client: `apps/web/src/world/worldApi.ts`
  - API: `POST /api/maps`
  - Backend: `apps/api/src/main/java/com/worldforge/api/service/MapPersistenceService.java`

## 11. List Saved Maps

- Purpose: Confirm the user can see their own saved maps.
- Prerequisites: At least one map has been saved.
- Steps:
  - Open `$web/maps`.
  - Click `Refresh` if needed.
- Expected Result: Saved maps are listed with title, visibility, size, updated time, and mapHash.
- If Fails Check:
  - UI: `apps/web/src/pages/MapLibraryPage.tsx`
  - API: `GET /api/me/maps`
  - Backend: `MapPersistenceService.listMyMaps`

## 12. Map Detail Lookup

- Purpose: Confirm a saved map can be retrieved by id.
- Prerequisites: A saved project id is available from `/maps` or API output.
- Steps:
  - Current UI has no standalone `/maps/{id}` detail page; use API for detail validation.

```powershell
$mapId = "<project-id>"
Invoke-RestMethod "$api/api/maps/$mapId" -Headers $headers
```

- Expected Result: API returns project metadata and `currentVersion` recipe/stats/mapHash. Private maps are visible only to the owner.
- If Fails Check:
  - API: `GET /api/maps/{projectId}`
  - Backend: `MapPersistenceService.getMap`
  - Tests: `MapApiIntegrationTests.hidesPrivateMapsFromOtherUsersAndAnonymousRequests`

## 13. Create World Instance

- Purpose: Confirm a saved map version can become a World Instance.
- Prerequisites: A saved map has a `currentVersionId`.
- Steps:
  - From `/editor`, click `Open World` after saving, or open `/maps` and click `Open World`.
  - Optional API check:

```powershell
$world = Invoke-RestMethod -Method Post "$api/api/world-instances" -Headers $headers -ContentType "application/json" -Body (@{
  mapVersionId = "<current-version-id>"
  name = "E2E World"
  worldTime = 0
  entities = @()
} | ConvertTo-Json -Depth 10)
```

- Expected Result: Browser navigates to `/world/{worldInstanceId}`; API returns a world instance owned by the current user.
- If Fails Check:
  - UI: `apps/web/src/pages/EditorPage.tsx`, `apps/web/src/pages/MapLibraryPage.tsx`
  - API: `POST /api/world-instances`
  - Backend: `apps/api/src/main/java/com/worldforge/api/service/WorldInstanceService.java`

## 14. Player Movement

- Purpose: Confirm the player dot moves client-side.
- Prerequisites: `/world/{id}` is open and the world loaded.
- Steps:
  - Press Arrow keys or WASD.
  - Watch the player dot and the player coordinate in the sidebar.
- Expected Result: Player position changes on walkable tiles; world time increments; repeated key presses respect the displayed movement cost.
- If Fails Check:
  - UI: `apps/web/src/pages/WorldPage.tsx`
  - Movement logic: `apps/web/src/world/worldState.ts`
  - Canvas: `apps/web/src/world/WorldCanvas.tsx`

## 15. Entity Wander

- Purpose: Confirm non-player entities move without server simulation ticks.
- Prerequisites: `/world/{id}` is open and loaded with creature entities.
- Steps:
  - Wait 2 to 5 seconds.
  - Observe creature dots in 2D.
  - Optionally switch 2D/3D and confirm entity positions remain consistent.
- Expected Result: Entity dots wander client-side, avoid blocked tiles, and prefer reachable low-cost paths when available; no server polling tick is required.
- If Fails Check:
  - UI interval: `apps/web/src/pages/WorldPage.tsx`
  - Logic: `worldState.tickWanderingEntities`
  - Tests: `apps/web/src/world/worldState.test.ts`

## 16. Blocked Tile Movement Is Prevented

- Purpose: Confirm `collisionMap`, blocked objects, and height rules prevent illegal movement.
- Prerequisites: World is open with visible blocked terrain such as water, trees, mountain cliffs, or cave walls.
- Steps:
  - Move the player toward a visibly blocked tile.
  - Move across road, grass, and forest tiles when they are visible.
  - Watch the player coordinate in the sidebar.
- Expected Result: The player does not enter blocked tiles; water, tree, and cave-wall tiles are blocked; road has lower movement cost than grass, and forest has higher movement cost; low height differences are reachable, high cliffs are blocked or routed around, and 3D movement-readiness indicators match the same 2D movement rules.
- If Fails Check:
  - Logic: `worldState.canEnterTile`
  - Tests: `worldState.test.ts` cases for collision, blocked objects, costMap, terrain cost normalization, jumpHeight, and maxSlope
  - Source data: `collisionMap`, `costMap`, `terrainMap`, `heightMap`, `objectList` in `MapData`

## 16a. Cave Portal Transition

- Purpose: Confirm surface and cave layers use the same World Instance state and can transition through portals.
- Prerequisites: World is open from a map generated with `Caves` enabled and `portalList` is non-empty.
- Steps:
  - Move the player onto a visible cave entrance marker.
  - Press `E`, `Enter`, or click `Use Portal` if the player is standing on the portal.
  - Repeat the action on the cave-side portal to return to surface.
- Expected Result: The player `layerId` changes between `surface` and `cave`; player coordinates update to the portal target; entity state remains client-side.
- If Fails Check:
  - Portal logic: `apps/web/src/world/worldState.ts`
  - UI activation: `apps/web/src/pages/WorldPage.tsx`
  - Canvas markers: `apps/web/src/world/WorldCanvas.tsx`
  - Source data: `MapData.portalList`

## 17. Save World State

- Purpose: Confirm client-side world state snapshots are persisted.
- Prerequisites: Player has moved at least once.
- Steps:
  - Click `Save` in `/world/{id}`.
  - Optional API check:

```powershell
Invoke-RestMethod "$api/api/world-instances/<worldInstanceId>/state" -Headers $headers
```

- Expected Result: API state contains updated `worldTime`, player position, entity positions, layer ids, state, behavior, and metadata.
- If Fails Check:
  - UI: `WorldPage.saveCurrentState`
  - API: `PUT /api/world-instances/{worldInstanceId}/state`
  - Backend: `WorldInstanceService.saveWorldState`

## 18. Reload World State

- Purpose: Confirm saved positions and layer are restored after reload.
- Prerequisites: World state has been saved after movement.
- Steps:
  - Reload the browser tab, or leave `/world/{id}` and open it again.
  - Compare player/entity coordinates, layer, and world time with the saved state.
- Expected Result: Saved player/entity positions, layer, jumpHeight, maxSlope, movement metadata, and world time are restored.
- If Fails Check:
  - UI load path: `WorldPage.loadWorld`
  - API: `GET /api/world-instances/{worldInstanceId}/state`
  - DTO mapping: `worldState.fromEntityStateDto`

## 19. Publish Public Map

- Purpose: Confirm a private map can become public/searchable.
- Prerequisites: A saved private map exists and Elasticsearch is running.
- Steps:
  - Open `/maps`.
  - Click `Publish` on a private map.
  - Optional API check:

```powershell
$mapId = "<project-id>"
Invoke-RestMethod -Method Patch "$api/api/maps/$mapId" -Headers $headers -ContentType "application/json" -Body (@{
  visibility = "PUBLIC"
} | ConvertTo-Json)
```

- Expected Result: Map visibility becomes `PUBLIC`; indexing is triggered after transaction commit.
- If Fails Check:
  - UI: `apps/web/src/pages/MapLibraryPage.tsx`
  - API: `PATCH /api/maps/{projectId}`
  - Projection: `MapSearchProjectionService.syncProject`

## 20. Private Map Is Hidden From Search

- Purpose: Confirm private maps are not exposed through Elasticsearch search.
- Prerequisites: At least one private map exists with a recognizable title.
- Steps:
  - Search by the private map title in `/search`.
  - API check:

```powershell
Invoke-RestMethod "$api/api/search/maps?keyword=<private-title>"
```

- Expected Result: The private map is not returned.
- If Fails Check:
  - Projection guard: `MapSearchProjectionService.syncProject`
  - Visibility update path: `MapPersistenceService.updateMap`
  - Tests: `SearchApiIntegrationTests.indexesOnlyPublicMapsAndSupportsSafeFilters`

## 21. Public Map Appears In Elasticsearch Search

- Purpose: Confirm public maps are searchable through the safe search API.
- Prerequisites: A map has been published and Elasticsearch is healthy.
- Steps:
  - Open `/search`.
  - Search by title, feature, or living stats.
  - API check:

```powershell
Invoke-RestMethod "$api/api/search/maps?keyword=<public-title>"
Invoke-RestMethod "$api/api/search/maps?features=forests,roads"
Invoke-RestMethod "$api/api/search/maps?minCreatureCount=1&minReachableAreaRatio=0.5"
```

- Expected Result: The public map appears in results. No raw Elasticsearch query is accepted.
- If Fails Check:
  - UI: `apps/web/src/pages/SearchPage.tsx`
  - API: `GET /api/search/maps`
  - Parser: `MapSearchRequestParser`
  - ES client: `HttpMapSearchIndexClient`

## 22. Elasticsearch Reindex

- Purpose: Confirm the search index can be rebuilt from PostgreSQL public maps.
- Prerequisites: API is running with `WORLD_FORGE_ADMIN_ENABLED=true` and `WORLD_FORGE_ADMIN_TOKEN` set.
- Steps:

```powershell
Invoke-RestMethod -Method Post "$api/api/admin/search/maps/reindex" -Headers @{
  "X-World-Forge-Admin-Token" = "manual-admin-token"
}
```

- Expected Result: Response includes `indexName`, `publicProjects`, `indexedDocuments`, `skippedProjects`, and `rebuiltAt`.
- If Fails Check:
  - API: `POST /api/admin/search/maps/reindex`
  - Controller: `AdminSearchController`
  - Service: `MapSearchReindexService`
  - ES client: `MapSearchIndexClient.replaceAll`

## 23. Search Results Persist After Reindex

- Purpose: Confirm public search results remain available after reindex and stale private documents are removed.
- Prerequisites: Reindex has completed successfully.
- Steps:
  - Search again for the public map title.
  - Search again for a private map title.

```powershell
Invoke-RestMethod "$api/api/search/maps?keyword=<public-title>"
Invoke-RestMethod "$api/api/search/maps?keyword=<private-title>"
```

- Expected Result: Public map still appears; private map does not appear.
- If Fails Check:
  - Reindex source query: `MapProjectRepository.findByVisibilityOrderByUpdatedAtDesc`
  - Reindex service: `MapSearchReindexService.reindexPublicMaps`
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
