import type { EntityStateDto, EntityType, MapData, Portal } from "@world-forge/shared";

export const worldEntityStates = [
  "idle",
  "choosingTarget",
  "wandering",
  "traveling",
  "investigating",
  "returningHome",
  "stuck",
  "chasing",
  "attacking",
  "hitStun",
  "defeated",
  "respawning",
  "transitioning",
] as const;

export type WorldEntityState = (typeof worldEntityStates)[number];

export interface WorldEntity {
  id?: string;
  worldInstanceId: string;
  entityKey: string;
  entityType: EntityType;
  layerId: string;
  x: number;
  y: number;
  z?: number | null;
  homeX?: number | null;
  homeY?: number | null;
  movementCostMultiplier: number;
  jumpHeight: number;
  maxSlope: number;
  state: WorldEntityState;
  behavior: string;
  metadataJson: Record<string, unknown>;
}

export interface SaveEntityStatePayload {
  entityKey: string;
  entityType: EntityType;
  layerId: string;
  x: number;
  y: number;
  z?: number | null;
  homeX?: number | null;
  homeY?: number | null;
  movementCostMultiplier: number;
  jumpHeight: number;
  maxSlope: number;
  state: WorldEntityState;
  behavior: string;
  metadataJson: Record<string, unknown>;
}

export interface WorldNavigationPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  layerId: string;
  kind?: string;
  tone?: string;
  priority?: number;
}

export interface WorldNavigationContext {
  core?: WorldNavigationPoint | null;
  regions?: readonly WorldNavigationPoint[];
  pois?: readonly WorldNavigationPoint[];
}

interface PathfindingOptions {
  maxVisited?: number;
}

interface PathNode {
  x: number;
  y: number;
  score: number;
  priority: number;
}

interface TilePoint {
  x: number;
  y: number;
}

interface SpawnResult extends TilePoint {
  fallbackReason?: string;
  componentSize: number;
}

interface WanderDecision {
  path: TilePoint[];
  target: TilePoint | null;
  componentSize: number;
  fallbackReason?: string;
  state: WorldEntityState;
  targetMetadata?: WorldNavigationPoint;
}

interface NavigationCandidate extends TilePoint {
  id: string;
  label: string;
  layerId: string;
  kind: string;
  tone?: string;
  priority: number;
  score: number;
}

const surfaceLayer = "surface";
const maxTileCost = 254;
const defaultMaxVisited = 768;
const defaultCreatureMaxHp = 3;
const defaultPlayerMaxHp = 10;
const terrainCost: Record<string, number> = {
  "deep-water": Number.POSITIVE_INFINITY,
  water: Number.POSITIVE_INFINITY,
  sand: 2,
  grass: 2,
  forest: 4,
  mountain: 8,
  road: 1,
  "cave-floor": 2,
  "cave-wall": Number.POSITIVE_INFINITY,
};
const neighborDirections = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const maxRecentPositions = 6;
const stuckRelocationThreshold = 3;

export function fromEntityStateDto(entity: EntityStateDto): WorldEntity {
  return withEntityDefaults({
    id: entity.id,
    worldInstanceId: entity.worldInstanceId,
    entityKey: entity.entityKey,
    entityType: entity.entityType,
    layerId: entity.layerId,
    x: entity.x,
    y: entity.y,
    z: entity.z,
    homeX: entity.homeX,
    homeY: entity.homeY,
    movementCostMultiplier: entity.movementCostMultiplier ?? defaultMovementCostMultiplier(entity.entityType),
    jumpHeight: entity.jumpHeight ?? defaultJumpHeight(entity.entityType),
    maxSlope: entity.maxSlope ?? defaultMaxSlope(entity.entityType),
    state: normalizeEntityState(entity.state),
    behavior: entity.behavior,
    metadataJson: entity.metadataJson,
  });
}

export function createInitialWorldEntities(worldInstanceId: string, mapData: MapData): WorldEntity[] {
  const worldSeed = `${worldInstanceId}:${mapData.mapHash}:${mapData.width}x${mapData.height}`;
  const playerSeed = withEntityDefaults({
    worldInstanceId,
    entityKey: "player",
    entityType: "player",
    layerId: surfaceLayer,
    x: Math.floor(mapData.width / 2),
    y: Math.floor(mapData.height / 2),
    z: null,
    homeX: null,
    homeY: null,
    movementCostMultiplier: 1,
    jumpHeight: 1,
    maxSlope: defaultMaxSlope("player"),
    state: "idle",
    behavior: "manual",
    metadataJson: {
      role: "explorer",
      visitedTargetIds: [],
    },
  });
  const occupied: TilePoint[] = [];
  const player = selectSpawnTile(mapData, playerSeed, {
    occupied,
    preferredX: playerSeed.x,
    preferredY: playerSeed.y,
    seed: `${worldSeed}:player`,
    minDistance: 0,
  });
  occupied.push(player);

  const firstCreatureSeed = createCreature(worldInstanceId, "creature-1", player.x, player.y, creatureMovementProfile(mapData, "creature-1"));
  const firstCreature = selectSpawnTile(mapData, firstCreatureSeed, {
    occupied,
    preferredX: player.x,
    preferredY: player.y,
    seed: `${worldSeed}:${firstCreatureSeed.entityKey}`,
    minDistance: spawnMinDistance(mapData, firstCreatureSeed),
  });
  occupied.push(firstCreature);

  const secondCreatureSeed = createCreature(worldInstanceId, "creature-2", player.x, player.y, creatureMovementProfile(mapData, "creature-2"));
  const secondCreature = selectSpawnTile(mapData, secondCreatureSeed, {
    occupied,
    preferredX: player.x,
    preferredY: player.y,
    seed: `${worldSeed}:${secondCreatureSeed.entityKey}`,
    minDistance: spawnMinDistance(mapData, secondCreatureSeed),
  });

  return [
    {
      ...playerSeed,
      x: player.x,
      y: player.y,
      homeX: player.x,
      homeY: player.y,
      z: mapData.heightMap[player.y * mapData.width + player.x] ?? null,
      metadataJson: spawnMetadata(playerSeed, player),
    },
    {
      ...firstCreatureSeed,
      x: firstCreature.x,
      y: firstCreature.y,
      homeX: firstCreature.x,
      homeY: firstCreature.y,
      z: mapData.heightMap[firstCreature.y * mapData.width + firstCreature.x] ?? null,
      metadataJson: spawnMetadata(firstCreatureSeed, firstCreature),
    },
    {
      ...secondCreatureSeed,
      x: secondCreature.x,
      y: secondCreature.y,
      homeX: secondCreature.x,
      homeY: secondCreature.y,
      z: mapData.heightMap[secondCreature.y * mapData.width + secondCreature.x] ?? null,
      metadataJson: spawnMetadata(secondCreatureSeed, secondCreature),
    },
  ];
}

export function movePlayer(
  mapData: MapData,
  entities: readonly WorldEntity[],
  dx: number,
  dy: number,
  worldTime = 0,
): WorldEntity[] {
  return entities.map((entity) => {
    if (entity.entityType !== "player") {
      return entity;
    }
    return moveEntity(mapData, entity, dx, dy, worldTime);
  });
}

export function activatePlayerPortal(mapData: MapData, entities: readonly WorldEntity[]): WorldEntity[] {
  return entities.map((entity) => {
    if (entity.entityType !== "player") {
      return entity;
    }
    return applyPortalTransition(mapData, {
      ...entity,
      state: "idle",
    });
  });
}

export function tickWanderingEntities(
  mapData: MapData,
  entities: readonly WorldEntity[],
  worldTime: number,
  navigationContext: WorldNavigationContext = {},
): WorldEntity[] {
  return entities.map((entity) => {
    const isAutoPlayer = entity.entityType === "player" && entity.behavior === "autoExplore";
    const isWanderingEntity = entity.entityType !== "player" && entity.behavior === "wander";
    if (!isAutoPlayer && !isWanderingEntity) {
      return entity;
    }
    const lifecycleEntity = tickEntityLifecycle(mapData, entity, worldTime);
    if (lifecycleEntity) {
      return lifecycleEntity;
    }
    const safeEntity = ensureEntityInWalkableRegion(mapData, entity, worldTime);
    if (safeEntity !== entity) {
      return safeEntity;
    }
    if (nextMoveAt(entity) > worldTime) {
      return entity;
    }
    return tickLivingEntity(mapData, entity, worldTime, navigationContext);
  });
}

export function setPlayerAutoExplore(entities: readonly WorldEntity[], enabled: boolean): WorldEntity[] {
  return entities.map((entity) => {
    if (entity.entityType !== "player") {
      return entity;
    }
    return {
      ...entity,
      behavior: enabled ? "autoExplore" : "manual",
      state: enabled ? "choosingTarget" : "idle",
      metadataJson: {
        ...entity.metadataJson,
        autoExplore: enabled,
        currentTarget: enabled ? entity.metadataJson.currentTarget ?? null : null,
        wanderTarget: enabled ? entity.metadataJson.wanderTarget ?? null : null,
      },
    };
  });
}

function tickLivingEntity(
  mapData: MapData,
  entity: WorldEntity,
  worldTime: number,
  navigationContext: WorldNavigationContext,
): WorldEntity {
  const investigatingUntil = metadataNumber(entity.metadataJson.investigateUntil);
  if (investigatingUntil > worldTime) {
    return {
      ...entity,
      state: "investigating",
    };
  }

  const currentTarget = readNavigationTarget(entity.metadataJson.currentTarget) ?? readNavigationTarget(entity.metadataJson.wanderTarget);
  if (currentTarget && currentTarget.layerId === entity.layerId && entity.x === currentTarget.x && entity.y === currentTarget.y) {
    return markTargetInvestigated(entity, currentTarget, worldTime);
  }

  const decision = chooseWanderDecision(mapData, entity, worldTime, navigationContext);
    if (decision.path.length === 0 || !decision.target) {
      return handleStuckWanderer(mapData, entity, worldTime, decision.fallbackReason ?? "no-reachable-wander-target");
    }
    return moveEntityTo(mapData, entity, decision.path[0].x, decision.path[0].y, worldTime, {
      currentTarget: decision.targetMetadata ?? { ...decision.target, layerId: entity.layerId, kind: "wander", label: "Wander target" },
      wanderTarget: decision.target,
      currentPath: decision.path.slice(0, 10),
      currentIntent: decision.state,
      wanderComponentSize: decision.componentSize,
      stuckCount: 0,
      investigateUntil: null,
    }, decision.state);
}

function tickEntityLifecycle(mapData: MapData, entity: WorldEntity, worldTime: number): WorldEntity | null {
  if (entity.state === "defeated" || entity.state === "respawning") {
    const respawnAt = metadataNumber(entity.metadataJson.respawnAt);
    if (entity.entityType !== "player" && respawnAt > 0 && respawnAt <= worldTime) {
      return respawnEntity(mapData, entity, worldTime);
    }
    return {
      ...entity,
      state: entity.state,
      metadataJson: {
        ...entity.metadataJson,
        currentPath: [],
      },
    };
  }

  if (entity.state === "hitStun") {
    const hitStunUntil = metadataNumber(entity.metadataJson.hitStunUntil);
    if (hitStunUntil <= 0 || hitStunUntil > worldTime) {
      return entity;
    }
    return {
      ...entity,
      state: "choosingTarget",
      metadataJson: {
        ...entity.metadataJson,
        hitStunUntil: null,
        hitFlashUntil: null,
      },
    };
  }

  if (entity.state === "attacking") {
    const attackUntil = metadataNumber(entity.metadataJson.attackUntil);
    if (attackUntil <= 0 || attackUntil > worldTime) {
      return entity;
    }
    return {
      ...entity,
      state: "chasing",
      metadataJson: {
        ...entity.metadataJson,
        attackUntil: null,
      },
    };
  }

  return null;
}

export function serializeWorldEntities(entities: readonly WorldEntity[]): SaveEntityStatePayload[] {
  return entities.map((entity) => ({
    entityKey: entity.entityKey,
    entityType: entity.entityType,
    layerId: entity.layerId,
    x: entity.x,
    y: entity.y,
    z: entity.z ?? null,
    homeX: entity.homeX ?? null,
    homeY: entity.homeY ?? null,
    movementCostMultiplier: entity.movementCostMultiplier,
    jumpHeight: entity.jumpHeight,
    maxSlope: entity.maxSlope,
    state: entity.state,
    behavior: entity.behavior,
    metadataJson: entity.metadataJson,
  }));
}

export function activeLayerForEntities(entities: readonly WorldEntity[]): string {
  return entities.find((entity) => entity.entityType === "player")?.layerId ?? surfaceLayer;
}

export function isWalkable(mapData: MapData, x: number, y: number, entity?: WorldEntity): boolean {
  return canEnterTile(mapData, entity ?? null, x, y);
}

export function movementCostAt(mapData: MapData, entity: WorldEntity, x: number, y: number): number {
  if (!isInsideMap(mapData, x, y)) {
    return Number.POSITIVE_INFINITY;
  }
  const tileIndex = y * mapData.width + x;
  const costFromMap = mapData.costMap[tileIndex] ?? Number.NaN;
  const costFromTerrain = terrainCost[mapData.terrainMap[tileIndex] ?? "grass"] ?? terrainCost.grass;
  if (costFromMap >= maxTileCost || !Number.isFinite(costFromTerrain)) {
    return Number.POSITIVE_INFINITY;
  }
  const baseCost = normalizeTileCost(costFromMap, costFromTerrain);
  return Math.max(1, Math.ceil(baseCost * entity.movementCostMultiplier));
}

export function findFirstWalkableTile(
  mapData: MapData,
  preferredX: number,
  preferredY: number,
  entity?: WorldEntity,
): { x: number; y: number } {
  return findNearestEnterableTile(mapData, preferredX, preferredY, entity ?? null)
    ?? { x: clampInteger(preferredX, 0, mapData.width - 1), y: clampInteger(preferredY, 0, mapData.height - 1) };
}

export function findPath(
  mapData: MapData,
  entity: WorldEntity,
  target: { x: number; y: number },
  options: PathfindingOptions = {},
): { x: number; y: number }[] {
  const targetX = clampInteger(target.x, 0, mapData.width - 1);
  const targetY = clampInteger(target.y, 0, mapData.height - 1);
  if (entity.x === targetX && entity.y === targetY) {
    return [];
  }
  if (!canEnterTile(mapData, entity, targetX, targetY)) {
    return [];
  }

  const maxVisited = options.maxVisited ?? defaultMaxVisited;
  const open: PathNode[] = [{
    x: entity.x,
    y: entity.y,
    score: 0,
    priority: manhattan(entity.x, entity.y, targetX, targetY),
  }];
  const bestScore = new Map<string, number>([[tileKey(entity.x, entity.y), 0]]);
  const previous = new Map<string, string>();
  let visited = 0;

  while (open.length > 0 && visited < maxVisited) {
    open.sort((left, right) => left.priority - right.priority);
    const current = open.shift();
    if (!current) {
      break;
    }
    visited += 1;

    if (current.x === targetX && current.y === targetY) {
      return reconstructPath(previous, tileKey(targetX, targetY), tileKey(entity.x, entity.y));
    }

    for (const [dx, dy] of neighborDirections) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      if (!canMoveBetween(mapData, entity, current.x, current.y, nextX, nextY)) {
        continue;
      }
      const stepCost = movementCostAt(mapData, entity, nextX, nextY);
      if (!Number.isFinite(stepCost)) {
        continue;
      }
      const nextScore = current.score + stepCost;
      const key = tileKey(nextX, nextY);
      const knownScore = bestScore.get(key);
      if (knownScore !== undefined && knownScore <= nextScore) {
        continue;
      }
      bestScore.set(key, nextScore);
      previous.set(key, tileKey(current.x, current.y));
      open.push({
        x: nextX,
        y: nextY,
        score: nextScore,
        priority: nextScore + manhattan(nextX, nextY, targetX, targetY),
      });
    }
  }

  return [];
}

export function portalAt(mapData: MapData, layerId: string, x: number, y: number): Portal | null {
  return mapData.portalList.find((portal) => portal.fromLayerId === layerId && portal.x === x && portal.y === y) ?? null;
}

export function canTraverseHeightDiff(entity: WorldEntity, heightDiff: number): boolean {
  if (!Number.isFinite(heightDiff)) {
    return false;
  }
  const normalizedDiff = Math.abs(heightDiff);
  return normalizedDiff <= entity.jumpHeight && normalizedDiff <= entity.maxSlope;
}

function createCreature(worldInstanceId: string, entityKey: string, x: number, y: number, movementProfile: string): WorldEntity {
  return withEntityDefaults({
    worldInstanceId,
    entityKey,
    entityType: "creature",
    layerId: surfaceLayer,
    x,
    y,
    z: null,
    homeX: x,
    homeY: y,
    movementCostMultiplier: 1.4,
    jumpHeight: 0.25,
    maxSlope: defaultMaxSlope("creature"),
    state: "idle",
    behavior: "wander",
    metadataJson: {
      movementProfile,
      archetype: movementProfile,
      respawnCount: 0,
    },
  });
}

function moveEntity(mapData: MapData, entity: WorldEntity, dx: number, dy: number, worldTime: number): WorldEntity {
  if (dx === 0 && dy === 0) {
    return applyPortalTransition(mapData, {
      ...entity,
      state: "idle",
    });
  }
  if (nextMoveAt(entity) > worldTime) {
    return {
      ...entity,
      state: entity.state === "stuck" ? "stuck" : entity.state,
    };
  }
  return moveEntityTo(mapData, entity, entity.x + dx, entity.y + dy, worldTime, {
    currentTarget: null,
    wanderTarget: null,
    currentPath: [],
  }, entity.entityType === "player" ? "traveling" : "wandering");
}

function moveEntityTo(
  mapData: MapData,
  entity: WorldEntity,
  nextX: number,
  nextY: number,
  worldTime: number,
  extraMetadata: Record<string, unknown> = {},
  nextState: WorldEntityState = entity.entityType === "player" ? "traveling" : "wandering",
): WorldEntity {
  if (!canMoveBetween(mapData, entity, entity.x, entity.y, nextX, nextY)) {
    return {
      ...entity,
      state: entity.entityType === "player" ? "idle" : "stuck",
      metadataJson: {
        ...entity.metadataJson,
        failedMove: { x: nextX, y: nextY, worldTime },
      },
    };
  }
  const moveCost = movementCostAt(mapData, entity, nextX, nextY);
  const moved = {
    ...entity,
    x: nextX,
    y: nextY,
    z: mapData.heightMap[nextY * mapData.width + nextX] ?? entity.z ?? null,
    state: nextState,
    metadataJson: {
      ...entity.metadataJson,
      ...extraMetadata,
      lastMoveCost: moveCost,
      nextMoveAt: worldTime + moveCost,
      previousPosition: { x: entity.x, y: entity.y },
      recentPositions: appendRecentPosition(entity, nextX, nextY),
    },
  };
  return applyPortalTransition(mapData, moved);
}

function applyPortalTransition(mapData: MapData, entity: WorldEntity): WorldEntity {
  const portal = portalAt(mapData, entity.layerId, entity.x, entity.y);
  if (!portal || !isInsideMap(mapData, portal.targetX, portal.targetY)) {
    return entity;
  }
  const targetEntity = {
    ...entity,
    layerId: portal.toLayerId,
  };
  if (!canEnterTile(mapData, targetEntity, portal.targetX, portal.targetY)) {
    return entity;
  }
  return {
    ...entity,
    layerId: portal.toLayerId,
    x: portal.targetX,
    y: portal.targetY,
    z: mapData.heightMap[portal.targetY * mapData.width + portal.targetX] ?? entity.z ?? null,
    state: "transitioning",
    metadataJson: {
      ...entity.metadataJson,
      lastPortalId: portal.id,
      previousLayerId: portal.fromLayerId,
    },
  };
}

export function canMoveBetween(mapData: MapData, entity: WorldEntity, fromX: number, fromY: number, toX: number, toY: number): boolean {
  if (!canEnterTile(mapData, entity, toX, toY)) {
    return false;
  }
  const fromHeight = mapData.heightMap[fromY * mapData.width + fromX] ?? 0;
  const toHeight = mapData.heightMap[toY * mapData.width + toX] ?? 0;
  return canTraverseHeightDiff(entity, toHeight - fromHeight);
}

function canEnterTile(mapData: MapData, entity: WorldEntity | null, x: number, y: number): boolean {
  if (!isInsideMap(mapData, x, y)) {
    return false;
  }
  if (mapData.collisionMap[y * mapData.width + x] === true) {
    return false;
  }
  if (hasBlockingObject(mapData, entity?.layerId ?? surfaceLayer, x, y)) {
    return false;
  }
  if (!entity) {
    return true;
  }
  return Number.isFinite(movementCostAt(mapData, entity, x, y));
}

function hasBlockingObject(mapData: MapData, layerId: string, x: number, y: number): boolean {
  return mapData.objectList.some(
    (object) => object.layerId === layerId && object.x === x && object.y === y && objectBlocksMovement(object.type),
  );
}

function objectBlocksMovement(type: string): boolean {
  return type === "tree" || type === "rock";
}

function selectSpawnTile(
  mapData: MapData,
  entity: WorldEntity,
  options: {
    occupied: readonly TilePoint[];
    preferredX: number;
    preferredY: number;
    seed: string;
    minDistance: number;
  },
): SpawnResult {
  const start = findNearestEnterableTile(mapData, options.preferredX, options.preferredY, entity)
    ?? { x: clampInteger(options.preferredX, 0, mapData.width - 1), y: clampInteger(options.preferredY, 0, mapData.height - 1) };
  let component = collectConnectedComponent(mapData, entity, start.x, start.y, 12_000);
  let fallbackReason: string | undefined;

  if (component.length < minimumSpawnComponentSize(mapData)) {
    const largest = findLargestConnectedComponent(mapData, entity, 12_000);
    if (largest.length > component.length) {
      component = largest;
      fallbackReason = "preferred-region-too-small";
    }
  }

  const strictCandidates = spawnCandidates(mapData, entity, component, options.occupied, options.minDistance, true);
  if (strictCandidates.length > 0) {
    return {
      ...chooseDeterministicTile(strictCandidates, options.seed),
      fallbackReason,
      componentSize: component.length,
    };
  }

  const relaxedDistanceCandidates = spawnCandidates(mapData, entity, component, options.occupied, 1, true);
  if (relaxedDistanceCandidates.length > 0) {
    return {
      ...chooseDeterministicTile(relaxedDistanceCandidates, `${options.seed}:relaxed-distance`),
      fallbackReason: fallbackReason ?? "relaxed-min-distance",
      componentSize: component.length,
    };
  }

  const relaxedBoundaryCandidates = spawnCandidates(mapData, entity, component, options.occupied, 0, false);
  if (relaxedBoundaryCandidates.length > 0) {
    return {
      ...chooseDeterministicTile(relaxedBoundaryCandidates, `${options.seed}:relaxed-boundary`),
      fallbackReason: fallbackReason ?? "relaxed-boundary",
      componentSize: component.length,
    };
  }

  const nearest = findNearestEnterableTile(mapData, options.preferredX, options.preferredY, entity);
  if (nearest) {
    return {
      ...nearest,
      fallbackReason: fallbackReason ?? "nearest-enterable-fallback",
      componentSize: component.length,
    };
  }

  return {
    x: start.x,
    y: start.y,
    fallbackReason: "no-enterable-spawn-found",
    componentSize: component.length,
  };
}

function spawnCandidates(
  mapData: MapData,
  entity: WorldEntity,
  component: readonly TilePoint[],
  occupied: readonly TilePoint[],
  minDistance: number,
  avoidBoundary: boolean,
): TilePoint[] {
  return component.filter((tile) => {
    if (!isSpawnSafeTile(mapData, entity, tile.x, tile.y, avoidBoundary)) {
      return false;
    }
    return occupied.every((occupiedTile) => manhattan(tile.x, tile.y, occupiedTile.x, occupiedTile.y) >= minDistance);
  });
}

function isSpawnSafeTile(mapData: MapData, entity: WorldEntity, x: number, y: number, avoidBoundary: boolean): boolean {
  if (avoidBoundary && isBoundaryRisk(mapData, x, y)) {
    return false;
  }
  if (!canEnterTile(mapData, entity, x, y)) {
    return false;
  }
  return reachableNeighborCount(mapData, entity, x, y) >= minimumReachableNeighbors(mapData);
}

function reachableNeighborCount(mapData: MapData, entity: WorldEntity, x: number, y: number): number {
  let count = 0;
  for (const [dx, dy] of neighborDirections) {
    if (canMoveBetween(mapData, entity, x, y, x + dx, y + dy)) {
      count += 1;
    }
  }
  return count;
}

function minimumReachableNeighbors(mapData: MapData): number {
  return mapData.width * mapData.height <= 9 ? 1 : 2;
}

function minimumSpawnComponentSize(mapData: MapData): number {
  return Math.min(10, Math.max(2, Math.floor(mapData.width * mapData.height * 0.02)));
}

function spawnMinDistance(mapData: MapData, entity: WorldEntity): number {
  if (mapData.width * mapData.height <= 9) {
    return 1;
  }
  const baseDistance = entity.entityType === "creature" ? 6 : 4;
  return Math.max(2, Math.min(baseDistance, Math.floor(Math.min(mapData.width, mapData.height) / 4)));
}

function chooseDeterministicTile(candidates: readonly TilePoint[], seed: string): TilePoint {
  let best = candidates[0] ?? { x: 0, y: 0 };
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const tile of candidates) {
    const score = hashString(`${seed}:${tile.x}:${tile.y}`) / 0xffffffff;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

function findNearestEnterableTile(mapData: MapData, preferredX: number, preferredY: number, entity: WorldEntity | null): TilePoint | null {
  const startX = clampInteger(preferredX, 0, mapData.width - 1);
  const startY = clampInteger(preferredY, 0, mapData.height - 1);
  if (canEnterTile(mapData, entity, startX, startY)) {
    return { x: startX, y: startY };
  }

  const maxRadius = Math.max(mapData.width, mapData.height);
  for (let radius = 1; radius < maxRadius; radius += 1) {
    for (let y = startY - radius; y <= startY + radius; y += 1) {
      for (let x = startX - radius; x <= startX + radius; x += 1) {
        if ((Math.abs(x - startX) !== radius && Math.abs(y - startY) !== radius) || !canEnterTile(mapData, entity, x, y)) {
          continue;
        }
        return { x, y };
      }
    }
  }
  return null;
}

function collectConnectedComponent(mapData: MapData, entity: WorldEntity, startX: number, startY: number, maxTiles = 12_000): TilePoint[] {
  if (!canEnterTile(mapData, entity, startX, startY)) {
    return [];
  }
  const startKey = tileKey(startX, startY);
  const visited = new Set<string>([startKey]);
  const queue: TilePoint[] = [{ x: startX, y: startY }];
  const tiles: TilePoint[] = [];

  while (queue.length > 0 && tiles.length < maxTiles) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    tiles.push(current);
    for (const [dx, dy] of neighborDirections) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      const key = tileKey(nextX, nextY);
      if (visited.has(key) || !canMoveBetween(mapData, entity, current.x, current.y, nextX, nextY)) {
        continue;
      }
      visited.add(key);
      queue.push({ x: nextX, y: nextY });
    }
  }

  return tiles;
}

function findLargestConnectedComponent(mapData: MapData, entity: WorldEntity, maxTiles = 12_000): TilePoint[] {
  const visited = new Set<string>();
  let largest: TilePoint[] = [];

  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      const key = tileKey(x, y);
      if (visited.has(key) || !canEnterTile(mapData, entity, x, y)) {
        continue;
      }
      const component = collectConnectedComponent(mapData, entity, x, y, maxTiles);
      for (const tile of component) {
        visited.add(tileKey(tile.x, tile.y));
      }
      if (component.length > largest.length) {
        largest = component;
      }
    }
  }

  return largest;
}

function componentHasTile(component: readonly TilePoint[], tile: TilePoint): boolean {
  return component.some((candidate) => candidate.x === tile.x && candidate.y === tile.y);
}

function isBoundaryRisk(mapData: MapData, x: number, y: number): boolean {
  if (mapData.width <= 4 || mapData.height <= 4) {
    return false;
  }
  return x <= 0 || y <= 0 || x >= mapData.width - 1 || y >= mapData.height - 1;
}

function spawnMetadata(entity: WorldEntity, spawn: SpawnResult): Record<string, unknown> {
  return {
    ...entity.metadataJson,
    spawn: {
      x: spawn.x,
      y: spawn.y,
      componentSize: spawn.componentSize,
      fallbackReason: spawn.fallbackReason ?? null,
    },
    recentPositions: [{ x: spawn.x, y: spawn.y }],
  };
}

function normalizeTileCost(costFromMap: number, costFromTerrain: number): number {
  const rawCost = Number.isFinite(costFromMap) && costFromMap > 0 ? costFromMap : costFromTerrain;
  if (!Number.isFinite(rawCost)) {
    return Number.POSITIVE_INFINITY;
  }
  if (costFromTerrain === terrainCost.road) {
    return terrainCost.road;
  }
  if (costFromTerrain >= terrainCost.forest) {
    return Math.max(rawCost, costFromTerrain);
  }
  return rawCost;
}

function withEntityDefaults(entity: WorldEntity): WorldEntity {
  return {
    ...entity,
    movementCostMultiplier: normalizePositive(entity.movementCostMultiplier, defaultMovementCostMultiplier(entity.entityType)),
    jumpHeight: normalizePositive(entity.jumpHeight, defaultJumpHeight(entity.entityType)),
    maxSlope: normalizePositive(entity.maxSlope, defaultMaxSlope(entity.entityType)),
    metadataJson: entity.metadataJson ?? {},
  };
}

function defaultMovementCostMultiplier(entityType: EntityType): number {
  switch (entityType) {
    case "player":
      return 1;
    case "npc":
      return 1.2;
    case "creature":
      return 1.4;
  }
}

function defaultJumpHeight(entityType: EntityType): number {
  switch (entityType) {
    case "player":
      return 1;
    case "npc":
      return 0.5;
    case "creature":
      return 0.25;
  }
}

function defaultMaxSlope(entityType: EntityType): number {
  switch (entityType) {
    case "player":
      return 0.35;
    case "npc":
      return 0.28;
    case "creature":
      return 0.2;
  }
}

function defaultMaxHp(entityType: EntityType): number {
  return entityType === "player" ? defaultPlayerMaxHp : defaultCreatureMaxHp;
}

function creatureMovementProfile(mapData: MapData, entityKey: string): string {
  if (entityKey.endsWith("1")) {
    return (mapData.stats.forestRatio ?? 0) > 0.05 ? "forest" : "scout";
  }
  if (mapData.portalList.length > 0 || (mapData.stats.caveAreaRatio ?? 0) > 0.04 || mapData.objectList.some((object) => object.type === "cave-entrance")) {
    return "cave";
  }
  if ((mapData.stats.waterRatio ?? 0) > 0.24) {
    return "water-adjacent";
  }
  return "scout";
}

function ensureEntityInWalkableRegion(mapData: MapData, entity: WorldEntity, worldTime: number): WorldEntity {
  if (canEnterTile(mapData, entity, entity.x, entity.y) && reachableNeighborCount(mapData, entity, entity.x, entity.y) > 0) {
    return entity;
  }
  const relocated = selectSpawnTile(mapData, entity, {
    occupied: [],
    preferredX: entity.homeX ?? entity.x,
    preferredY: entity.homeY ?? entity.y,
    seed: `${mapData.mapHash}:${entity.entityKey}:relocate:${worldTime}`,
    minDistance: 0,
  });
  return {
    ...entity,
    x: relocated.x,
    y: relocated.y,
    homeX: relocated.x,
    homeY: relocated.y,
    z: mapData.heightMap[relocated.y * mapData.width + relocated.x] ?? entity.z ?? null,
    state: "choosingTarget",
    metadataJson: {
      ...entity.metadataJson,
      currentTarget: null,
      wanderTarget: null,
      currentPath: [],
      stuckCount: 0,
      relocationReason: relocated.fallbackReason ?? "invalid-current-tile",
      recentPositions: [{ x: relocated.x, y: relocated.y }],
    },
  };
}

function respawnEntity(mapData: MapData, entity: WorldEntity, worldTime: number): WorldEntity {
  const respawnCount = metadataNumber(entity.metadataJson.respawnCount) + 1;
  const maxHp = metadataNumber(entity.metadataJson.maxHp) || defaultMaxHp(entity.entityType);
  const respawn = selectSpawnTile(mapData, entity, {
    occupied: [{ x: entity.x, y: entity.y }],
    preferredX: entity.homeX ?? Math.floor(mapData.width / 2),
    preferredY: entity.homeY ?? Math.floor(mapData.height / 2),
    seed: `${mapData.mapHash}:${entity.entityKey}:respawn:${respawnCount}:${worldTime}`,
    minDistance: spawnMinDistance(mapData, entity),
  });

  return {
    ...entity,
    x: respawn.x,
    y: respawn.y,
    homeX: respawn.x,
    homeY: respawn.y,
    z: mapData.heightMap[respawn.y * mapData.width + respawn.x] ?? entity.z ?? null,
    state: "choosingTarget",
    metadataJson: {
      ...entity.metadataJson,
      hp: maxHp,
      maxHp,
      currentTarget: null,
      wanderTarget: null,
      currentPath: [],
      respawnAt: null,
      respawnCount,
      respawn: {
        x: respawn.x,
        y: respawn.y,
        componentSize: respawn.componentSize,
        fallbackReason: respawn.fallbackReason ?? null,
      },
      relocationReason: respawn.fallbackReason ?? null,
      recentPositions: [{ x: respawn.x, y: respawn.y }],
      stuckCount: 0,
    },
  };
}

function handleStuckWanderer(mapData: MapData, entity: WorldEntity, worldTime: number, reason: string): WorldEntity {
  const stuckCount = metadataNumber(entity.metadataJson.stuckCount) + 1;
  if (stuckCount >= stuckRelocationThreshold) {
    const relocated = selectSpawnTile(mapData, entity, {
      occupied: [],
      preferredX: entity.homeX ?? entity.x,
      preferredY: entity.homeY ?? entity.y,
      seed: `${mapData.mapHash}:${entity.entityKey}:stuck:${worldTime}:${stuckCount}`,
      minDistance: 0,
    });
    return {
      ...entity,
      x: relocated.x,
      y: relocated.y,
      homeX: relocated.x,
      homeY: relocated.y,
      z: mapData.heightMap[relocated.y * mapData.width + relocated.x] ?? entity.z ?? null,
      state: "choosingTarget",
      metadataJson: {
        ...entity.metadataJson,
        currentTarget: null,
        wanderTarget: null,
        currentPath: [],
        stuckCount: 0,
        stuckReason: reason,
        relocationReason: relocated.fallbackReason ?? "stuck-relocation",
        recentPositions: [{ x: relocated.x, y: relocated.y }],
      },
    };
  }
  return {
    ...entity,
    state: "stuck",
    metadataJson: {
      ...entity.metadataJson,
      currentTarget: null,
      wanderTarget: null,
      currentPath: [],
      stuckCount,
      stuckReason: reason,
    },
  };
}

function chooseWanderDecision(
  mapData: MapData,
  entity: WorldEntity,
  worldTime: number,
  navigationContext: WorldNavigationContext = {},
): WanderDecision {
  const component = collectConnectedComponent(mapData, entity, entity.x, entity.y, 6_000);
  if (component.length <= 1) {
    return { path: [], target: null, componentSize: component.length, fallbackReason: "isolated-region", state: "stuck" };
  }

  const homeTarget = returningHomeTarget(mapData, entity, component);
  if (homeTarget) {
    const homePath = findPath(mapData, entity, homeTarget, { maxVisited: defaultMaxVisited });
    if (homePath.length > 0 && !wouldOscillate(entity, homePath[0])) {
      return {
        path: homePath,
        target: homeTarget,
        componentSize: component.length,
        state: "returningHome",
        targetMetadata: { ...homeTarget, id: "home", label: "Home clearing", layerId: entity.layerId, kind: "home" },
      };
    }
  }

  const existingTarget = readNavigationTarget(entity.metadataJson.currentTarget) ?? readNavigationTarget(entity.metadataJson.wanderTarget);
  if (existingTarget && existingTarget.layerId === entity.layerId && componentHasTile(component, existingTarget) && manhattan(entity.x, entity.y, existingTarget.x, existingTarget.y) > 0) {
    const existingPath = findPath(mapData, entity, existingTarget, { maxVisited: defaultMaxVisited });
    if (existingPath.length > 0 && !wouldOscillate(entity, existingPath[0]) && pathIsMeaningful(mapData, entity, existingPath, existingTarget.kind)) {
      return {
        path: existingPath,
        target: existingTarget,
        componentSize: component.length,
        state: stateForTarget(entity, existingTarget),
        targetMetadata: existingTarget,
      };
    }
  }

  const recentKeys = new Set(recentPositions(entity).map((position) => tileKey(position.x, position.y)));
  const attempts = Math.min(8, Math.max(3, component.length));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const target = chooseWanderTarget(mapData, entity, component, worldTime, attempt, recentKeys, navigationContext);
    if (!target) {
      continue;
    }
    const path = findPath(mapData, entity, target, { maxVisited: defaultMaxVisited });
    if (path.length === 0 || wouldOscillate(entity, path[0]) || !pathIsMeaningful(mapData, entity, path, target.kind)) {
      recentKeys.add(tileKey(target.x, target.y));
      continue;
    }
    return {
      path,
      target,
      componentSize: component.length,
      state: stateForTarget(entity, target),
      targetMetadata: target,
    };
  }

  return { path: [], target: null, componentSize: component.length, fallbackReason: "target-selection-failed", state: "stuck" };
}

function chooseWanderTarget(
  mapData: MapData,
  entity: WorldEntity,
  component: readonly TilePoint[],
  worldTime: number,
  attempt: number,
  excludedKeys: ReadonlySet<string>,
  navigationContext: WorldNavigationContext,
): NavigationCandidate | null {
  const range = wanderDistanceRange(mapData, entity);
  const navigationCandidates = buildNavigationCandidates(mapData, entity, component, navigationContext, excludedKeys)
    .filter((candidate) => {
      const distance = manhattan(entity.x, entity.y, candidate.x, candidate.y);
      return distance >= Math.min(range.min, Math.max(1, range.max)) && distance <= Math.max(range.max, range.min);
    });
  const seed = `${mapData.mapHash}:${entity.entityKey}:wander:${worldTime}:${attempt}:${metadataNumber(entity.metadataJson.stuckCount)}`;
  if (navigationCandidates.length > 0) {
    return chooseScoredCandidate(mapData, entity, navigationCandidates, seed, range);
  }

  let candidates = component.filter((tile) => {
    const distance = manhattan(entity.x, entity.y, tile.x, tile.y);
    return distance >= range.min && distance <= range.max && !excludedKeys.has(tileKey(tile.x, tile.y));
  });

  if (candidates.length === 0) {
    candidates = component.filter((tile) => {
      const distance = manhattan(entity.x, entity.y, tile.x, tile.y);
      return distance >= Math.min(2, range.min) && !excludedKeys.has(tileKey(tile.x, tile.y));
    });
  }
  if (candidates.length === 0) {
    candidates = component.filter((tile) => manhattan(entity.x, entity.y, tile.x, tile.y) > 0);
  }
  if (candidates.length === 0) {
    return null;
  }

  const genericCandidates: NavigationCandidate[] = candidates.map((tile) => ({
    ...tile,
    id: `wander-${tile.x}-${tile.y}`,
    label: "열린 땅",
    layerId: entity.layerId,
    kind: "wander",
    priority: 10,
    score: 0,
  }));
  return chooseScoredCandidate(mapData, entity, genericCandidates, seed, range);
}

function chooseScoredCandidate(
  mapData: MapData,
  entity: WorldEntity,
  candidates: readonly NavigationCandidate[],
  seed: string,
  range: { min: number; max: number },
): NavigationCandidate {
  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const tile of candidates) {
    const distance = manhattan(entity.x, entity.y, tile.x, tile.y);
    const tileCost = movementCostAt(mapData, entity, tile.x, tile.y);
    const terrain = mapData.terrainMap[tile.y * mapData.width + tile.x];
    const distanceScore = Math.min(distance, range.max) / Math.max(1, range.max);
    const roadBonus = terrain === "road" ? 0.24 : 0;
    const costPenalty = Number.isFinite(tileCost) ? tileCost * 0.018 : 1;
    const hashScore = hashString(`${seed}:${tile.x}:${tile.y}`) / 0xffffffff;
    const score = hashScore + distanceScore * 0.42 + roadBonus + tile.score - tile.priority * 0.01 - costPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

function wanderDistanceRange(mapData: MapData, entity: WorldEntity): { min: number; max: number } {
  const maxDimension = Math.max(mapData.width, mapData.height);
  if (maxDimension <= 8) {
    return { min: 1, max: Math.max(2, maxDimension - 1) };
  }
  if (entity.entityType === "player") {
    return { min: Math.min(12, maxDimension - 1), max: Math.min(42, maxDimension - 1) };
  }
  if (entity.metadataJson.movementProfile === "scout" || entity.metadataJson.movementProfile === "flying" || entity.entityType === "npc") {
    return { min: Math.min(20, maxDimension - 1), max: Math.min(50, maxDimension - 1) };
  }
  return { min: Math.min(10, maxDimension - 1), max: Math.min(30, maxDimension - 1) };
}

function buildNavigationCandidates(
  mapData: MapData,
  entity: WorldEntity,
  component: readonly TilePoint[],
  navigationContext: WorldNavigationContext,
  excludedKeys: ReadonlySet<string>,
): NavigationCandidate[] {
  const candidates: NavigationCandidate[] = [];
  const componentKeys = new Set(component.map((tile) => tileKey(tile.x, tile.y)));
  const addPoint = (point: WorldNavigationPoint, kindFallback: string, baseScore: number) => {
    if (point.layerId !== entity.layerId) {
      return;
    }
    const nearest = nearestComponentTile(component, point.x, point.y);
    if (!nearest || excludedKeys.has(tileKey(nearest.x, nearest.y))) {
      return;
    }
    const key = `${point.id}:${nearest.x}:${nearest.y}`;
    if (candidates.some((candidate) => candidate.id === key || (candidate.x === nearest.x && candidate.y === nearest.y && candidate.kind === point.kind))) {
      return;
    }
    const visitedPenalty = entity.entityType === "player" && readStringArray(entity.metadataJson.visitedTargetIds).includes(point.id) ? -0.75 : 0;
    candidates.push({
      id: key,
      label: point.label,
      x: nearest.x,
      y: nearest.y,
      layerId: point.layerId,
      kind: point.kind ?? kindFallback,
      tone: point.tone,
      priority: point.priority ?? 5,
      score: baseScore + visitedPenalty + preferenceScore(mapData, entity, nearest.x, nearest.y, point.kind ?? kindFallback, point.tone),
    });
  };

  if (navigationContext.core) {
    addPoint(navigationContext.core, "core", entity.entityType === "player" ? 0.42 : 0.08);
  }
  for (const poi of navigationContext.pois ?? []) {
    addPoint(poi, "poi", 0.52);
  }
  for (const region of navigationContext.regions ?? []) {
    addPoint(region, "region", 0.38);
  }
  for (const portal of mapData.portalList) {
    if (portal.fromLayerId !== entity.layerId) {
      continue;
    }
    addPoint({
      id: `portal-${portal.id}`,
      label: portal.toLayerId === "cave" ? "동굴문" : "지상문",
      x: portal.x,
      y: portal.y,
      layerId: portal.fromLayerId,
      kind: "portal",
      tone: "cave",
      priority: 3,
    }, "portal", 0.48);
  }

  for (const tile of component) {
    const key = tileKey(tile.x, tile.y);
    if (excludedKeys.has(key)) {
      continue;
    }
    const terrain = mapData.terrainMap[tile.y * mapData.width + tile.x];
    if (terrain === "road" && hashString(`${entity.entityKey}:road:${key}`) % 9 === 0) {
      candidates.push({
        ...tile,
        id: `road-${key}`,
        label: "옛길 자취",
        layerId: entity.layerId,
        kind: "road",
        tone: "road",
        priority: 7,
        score: 0.32 + preferenceScore(mapData, entity, tile.x, tile.y, "road", "road"),
      });
    }
    if (isClearingTile(mapData, entity, tile.x, tile.y, componentKeys) && hashString(`${entity.entityKey}:clearing:${key}`) % 13 === 0) {
      candidates.push({
        ...tile,
        id: `clearing-${key}`,
        label: "빈터",
        layerId: entity.layerId,
        kind: "clearing",
        tone: "wild",
        priority: 8,
        score: 0.22 + preferenceScore(mapData, entity, tile.x, tile.y, "clearing", "wild"),
      });
    }
  }

  return candidates;
}

function returningHomeTarget(mapData: MapData, entity: WorldEntity, component: readonly TilePoint[]): NavigationCandidate | null {
  if (entity.entityType === "player" || entity.homeX === null || entity.homeX === undefined || entity.homeY === null || entity.homeY === undefined) {
    return null;
  }
  const range = wanderDistanceRange(mapData, entity);
  if (manhattan(entity.x, entity.y, entity.homeX, entity.homeY) <= Math.max(range.max * 1.45, 18)) {
    return null;
  }
  const nearestHome = nearestComponentTile(component, entity.homeX, entity.homeY);
  if (!nearestHome) {
    return null;
  }
  return {
    ...nearestHome,
    id: "home",
    label: "둥지 빈터",
    layerId: entity.layerId,
    kind: "home",
    priority: 1,
    score: 1.2,
  };
}

function pathIsMeaningful(mapData: MapData, entity: WorldEntity, path: readonly TilePoint[], targetKind?: string): boolean {
  if (path.length === 0) {
    return false;
  }
  if (mapData.width * mapData.height <= 64) {
    return true;
  }
  if (targetKind === "portal" || targetKind === "core" || targetKind === "home") {
    return true;
  }
  return path.length >= Math.min(4, Math.max(2, Math.floor(wanderDistanceRange(mapData, entity).min / 2)));
}

function stateForTarget(entity: WorldEntity, target: { kind?: string }): WorldEntityState {
  if (entity.state === "chasing") {
    return "chasing";
  }
  if (target.kind === "home") {
    return "returningHome";
  }
  if (target.kind === "portal" || target.kind === "landmark" || target.kind === "core" || target.kind === "poi") {
    return "traveling";
  }
  return entity.entityType === "player" ? "traveling" : "wandering";
}

function markTargetInvestigated(entity: WorldEntity, target: WorldNavigationPoint, worldTime: number): WorldEntity {
  const visitedTargetIds = entity.entityType === "player"
    ? [...new Set([...readStringArray(entity.metadataJson.visitedTargetIds), target.id])]
    : readStringArray(entity.metadataJson.visitedTargetIds);
  return {
    ...entity,
    state: "investigating",
    metadataJson: {
      ...entity.metadataJson,
      currentTarget: null,
      wanderTarget: null,
      currentPath: [],
      lastInvestigatedTarget: target,
      investigateUntil: worldTime + (entity.entityType === "player" ? 2 : 3),
      visitedTargetIds,
    },
  };
}

function preferenceScore(
  mapData: MapData,
  entity: WorldEntity,
  x: number,
  y: number,
  kind: string,
  tone?: string,
): number {
  const profile = String(entity.metadataJson.movementProfile ?? (entity.entityType === "player" ? "explorer" : "wild"));
  const terrain = mapData.terrainMap[y * mapData.width + x];
  let score = 0;
  if (entity.entityType === "player") {
    const targetId = `${kind}:${x}:${y}`;
    const visited = readStringArray(entity.metadataJson.visitedTargetIds);
    score += visited.includes(targetId) ? -0.18 : 0.48;
    score += kind === "portal" || kind === "poi" || kind === "landmark" ? 0.38 : 0;
  }
  if (profile === "forest") {
    score += terrain === "forest" ? 0.62 : terrain === "grass" ? 0.24 : 0;
    score += tone === "forest" || kind === "grove" ? 0.48 : 0;
  } else if (profile === "cave") {
    score += terrain === "cave-floor" || terrain === "mountain" ? 0.46 : 0;
    score += tone === "cave" || kind === "portal" || kind === "gate" ? 0.72 : 0;
  } else if (profile === "water-adjacent") {
    score += isShorelineTile(mapData, x, y) ? 0.72 : 0;
    score += tone === "water" || kind === "pool" ? 0.52 : 0;
  } else if (profile === "scout") {
    score += terrain === "road" ? 0.58 : 0;
    score += kind === "road" || kind === "portal" || kind === "landmark" || kind === "poi" ? 0.42 : 0;
  }
  score += terrain === "road" ? 0.12 : 0;
  return score;
}

function nearestComponentTile(component: readonly TilePoint[], preferredX: number, preferredY: number): TilePoint | null {
  let best: TilePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tile of component) {
    const distance = manhattan(tile.x, tile.y, preferredX, preferredY);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

function isClearingTile(mapData: MapData, entity: WorldEntity, x: number, y: number, componentKeys: ReadonlySet<string>): boolean {
  const terrain = mapData.terrainMap[y * mapData.width + x];
  if (terrain !== "grass" && terrain !== "sand" && terrain !== "road") {
    return false;
  }
  let openNeighbors = 0;
  for (const [dx, dy] of neighborDirections) {
    if (componentKeys.has(tileKey(x + dx, y + dy)) && canMoveBetween(mapData, entity, x, y, x + dx, y + dy)) {
      openNeighbors += 1;
    }
  }
  return openNeighbors >= 3;
}

function isShorelineTile(mapData: MapData, x: number, y: number): boolean {
  const terrain = mapData.terrainMap[y * mapData.width + x];
  if (terrain === "water" || terrain === "deep-water") {
    return false;
  }
  return neighborDirections.some(([dx, dy]) => {
    const nextX = x + dx;
    const nextY = y + dy;
    if (!isInsideMap(mapData, nextX, nextY)) {
      return false;
    }
    const neighborTerrain = mapData.terrainMap[nextY * mapData.width + nextX];
    return neighborTerrain === "water" || neighborTerrain === "deep-water";
  });
}

function wouldOscillate(entity: WorldEntity, next: TilePoint): boolean {
  const recent = recentPositions(entity);
  if (recent.length < 2) {
    return false;
  }
  const twoStepsBack = recent[recent.length - 2];
  return twoStepsBack.x === next.x && twoStepsBack.y === next.y;
}

function appendRecentPosition(entity: WorldEntity, x: number, y: number): TilePoint[] {
  const recent = recentPositions(entity);
  const next = [...recent, { x, y }];
  return next.slice(Math.max(0, next.length - maxRecentPositions));
}

function recentPositions(entity: WorldEntity): TilePoint[] {
  const value = entity.metadataJson.recentPositions;
  if (!Array.isArray(value)) {
    return [{ x: entity.x, y: entity.y }];
  }
  const positions = value
    .map(readTilePoint)
    .filter((position): position is TilePoint => position !== null);
  return positions.length > 0 ? positions : [{ x: entity.x, y: entity.y }];
}

function readTilePoint(value: unknown): TilePoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as { x?: unknown; y?: unknown };
  if (typeof candidate.x !== "number" || typeof candidate.y !== "number") {
    return null;
  }
  return {
    x: Math.trunc(candidate.x),
    y: Math.trunc(candidate.y),
  };
}

function readNavigationTarget(value: unknown): WorldNavigationPoint | null {
  const point = readTilePoint(value);
  if (!point || !value || typeof value !== "object") {
    return null;
  }
  const candidate = value as { id?: unknown; label?: unknown; layerId?: unknown; kind?: unknown; tone?: unknown; priority?: unknown };
  return {
    ...point,
    id: typeof candidate.id === "string" ? candidate.id : `target-${point.x}-${point.y}`,
    label: typeof candidate.label === "string" ? candidate.label : "Target",
    layerId: typeof candidate.layerId === "string" ? candidate.layerId : surfaceLayer,
    kind: typeof candidate.kind === "string" ? candidate.kind : "wander",
    tone: typeof candidate.tone === "string" ? candidate.tone : undefined,
    priority: typeof candidate.priority === "number" && Number.isFinite(candidate.priority) ? candidate.priority : undefined,
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizeEntityState(value: string): WorldEntityState {
  if ((worldEntityStates as readonly string[]).includes(value)) {
    return value as WorldEntityState;
  }
  if (value === "moving") {
    return "traveling";
  }
  if (value === "waiting" || value === "relocated") {
    return "idle";
  }
  return "idle";
}

function metadataNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nextMoveAt(entity: WorldEntity): number {
  const value = entity.metadataJson.nextMoveAt;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function reconstructPath(previous: Map<string, string>, targetKey: string, startKey: string): { x: number; y: number }[] {
  const reversed: string[] = [];
  let cursor = targetKey;
  while (cursor !== startKey) {
    reversed.push(cursor);
    const parent = previous.get(cursor);
    if (!parent) {
      return [];
    }
    cursor = parent;
  }
  reversed.reverse();
  return reversed.map((key) => {
    const [x, y] = key.split(":").map(Number);
    return { x, y };
  });
}

function manhattan(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.abs(toX - fromX) + Math.abs(toY - fromY);
}

function tileKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function isInsideMap(mapData: MapData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mapData.width && y < mapData.height;
}

function normalizePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
