import type { EntityStateDto, EntityType, MapData, Portal } from "@world-forge/shared";

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
  state: string;
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
  state: string;
  behavior: string;
  metadataJson: Record<string, unknown>;
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

const surfaceLayer = "surface";
const maxTileCost = 254;
const defaultMaxVisited = 768;
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
const wanderOffsets = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [2, 0],
  [-2, 0],
  [0, 2],
  [0, -2],
] as const;
const neighborDirections = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

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
    state: entity.state,
    behavior: entity.behavior,
    metadataJson: entity.metadataJson,
  });
}

export function createInitialWorldEntities(worldInstanceId: string, mapData: MapData): WorldEntity[] {
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
    metadataJson: {},
  });
  const player = findFirstWalkableTile(mapData, playerSeed.x, playerSeed.y, playerSeed);
  const firstCreatureSeed = createCreature(worldInstanceId, "creature-1", player.x + 4, player.y);
  const firstCreature = findFirstWalkableTile(mapData, firstCreatureSeed.x, firstCreatureSeed.y, firstCreatureSeed);
  const secondCreatureSeed = createCreature(worldInstanceId, "creature-2", player.x - 4, player.y + 3);
  const secondCreature = findFirstWalkableTile(mapData, secondCreatureSeed.x, secondCreatureSeed.y, secondCreatureSeed);

  return [
    {
      ...playerSeed,
      x: player.x,
      y: player.y,
    },
    {
      ...firstCreatureSeed,
      x: firstCreature.x,
      y: firstCreature.y,
      homeX: firstCreature.x,
      homeY: firstCreature.y,
    },
    {
      ...secondCreatureSeed,
      x: secondCreature.x,
      y: secondCreature.y,
      homeX: secondCreature.x,
      homeY: secondCreature.y,
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
): WorldEntity[] {
  return entities.map((entity) => {
    if (entity.entityType === "player" || entity.behavior !== "wander") {
      return entity;
    }
    if (nextMoveAt(entity) > worldTime) {
      return entity;
    }
    const path = chooseWanderPath(mapData, entity, worldTime);
    if (path.length === 0) {
      return {
        ...entity,
        state: "idle",
      };
    }
    return moveEntityTo(mapData, entity, path[0].x, path[0].y, worldTime);
  });
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
  const startX = clampInteger(preferredX, 0, mapData.width - 1);
  const startY = clampInteger(preferredY, 0, mapData.height - 1);
  if (isWalkable(mapData, startX, startY, entity)) {
    return { x: startX, y: startY };
  }

  const maxRadius = Math.max(mapData.width, mapData.height);
  for (let radius = 1; radius < maxRadius; radius += 1) {
    for (let y = startY - radius; y <= startY + radius; y += 1) {
      for (let x = startX - radius; x <= startX + radius; x += 1) {
        if (Math.abs(x - startX) !== radius && Math.abs(y - startY) !== radius) {
          continue;
        }
        if (isWalkable(mapData, x, y, entity)) {
          return { x, y };
        }
      }
    }
  }

  return { x: 0, y: 0 };
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

function createCreature(worldInstanceId: string, entityKey: string, x: number, y: number): WorldEntity {
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
    metadataJson: {},
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
      state: "waiting",
    };
  }
  return moveEntityTo(mapData, entity, entity.x + dx, entity.y + dy, worldTime);
}

function moveEntityTo(mapData: MapData, entity: WorldEntity, nextX: number, nextY: number, worldTime: number): WorldEntity {
  if (!canMoveBetween(mapData, entity, entity.x, entity.y, nextX, nextY)) {
    return {
      ...entity,
      state: "idle",
    };
  }
  const moveCost = movementCostAt(mapData, entity, nextX, nextY);
  const moved = {
    ...entity,
    x: nextX,
    y: nextY,
    z: mapData.heightMap[nextY * mapData.width + nextX] ?? entity.z ?? null,
    state: "moving",
    metadataJson: {
      ...entity.metadataJson,
      lastMoveCost: moveCost,
      nextMoveAt: worldTime + moveCost,
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

function chooseWanderPath(mapData: MapData, entity: WorldEntity, worldTime: number): { x: number; y: number }[] {
  const offsetStart = hashString(`${entity.entityKey}:${worldTime}`) % wanderOffsets.length;
  const homeX = entity.homeX ?? entity.x;
  const homeY = entity.homeY ?? entity.y;
  let bestPath: { x: number; y: number }[] = [];
  let bestCost = Number.POSITIVE_INFINITY;

  for (let index = 0; index < wanderOffsets.length; index += 1) {
    const [dx, dy] = wanderOffsets[(offsetStart + index) % wanderOffsets.length];
    if (dx === 0 && dy === 0) {
      continue;
    }
    const target = {
      x: clampInteger(homeX + dx, 0, mapData.width - 1),
      y: clampInteger(homeY + dy, 0, mapData.height - 1),
    };
    const path = findPath(mapData, entity, target, { maxVisited: 384 });
    if (path.length === 0) {
      continue;
    }
    const pathCost = path.reduce((total, step) => total + movementCostAt(mapData, entity, step.x, step.y), 0);
    if (pathCost < bestCost) {
      bestCost = pathCost;
      bestPath = path;
    }
  }

  return bestPath;
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
