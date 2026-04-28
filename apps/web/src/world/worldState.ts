import type { EntityStateDto, EntityType, MapData } from "@world-forge/shared";

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
  state: string;
  behavior: string;
  metadataJson: Record<string, unknown>;
}

const surfaceLayer = "surface";
const wanderDirections = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function fromEntityStateDto(entity: EntityStateDto): WorldEntity {
  return {
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
    state: entity.state,
    behavior: entity.behavior,
    metadataJson: entity.metadataJson,
  };
}

export function createInitialWorldEntities(worldInstanceId: string, mapData: MapData): WorldEntity[] {
  const player = findFirstWalkableTile(mapData, Math.floor(mapData.width / 2), Math.floor(mapData.height / 2));
  const firstCreature = findFirstWalkableTile(mapData, player.x + 4, player.y);
  const secondCreature = findFirstWalkableTile(mapData, player.x - 4, player.y + 3);

  return [
    {
      worldInstanceId,
      entityKey: "player",
      entityType: "player",
      layerId: surfaceLayer,
      x: player.x,
      y: player.y,
      z: null,
      homeX: null,
      homeY: null,
      state: "idle",
      behavior: "manual",
      metadataJson: {},
    },
    createCreature(worldInstanceId, "creature-1", firstCreature.x, firstCreature.y),
    createCreature(worldInstanceId, "creature-2", secondCreature.x, secondCreature.y),
  ];
}

export function movePlayer(mapData: MapData, entities: readonly WorldEntity[], dx: number, dy: number): WorldEntity[] {
  return entities.map((entity) => {
    if (entity.entityType !== "player") {
      return entity;
    }
    return moveEntity(mapData, entity, dx, dy);
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
    const direction = wanderDirections[hashString(`${entity.entityKey}:${worldTime}`) % wanderDirections.length];
    return moveEntity(mapData, entity, direction[0], direction[1]);
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
    state: entity.state,
    behavior: entity.behavior,
    metadataJson: entity.metadataJson,
  }));
}

export function isWalkable(mapData: MapData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) {
    return false;
  }
  return mapData.collisionMap[y * mapData.width + x] !== true;
}

export function findFirstWalkableTile(mapData: MapData, preferredX: number, preferredY: number): { x: number; y: number } {
  const startX = clampInteger(preferredX, 0, mapData.width - 1);
  const startY = clampInteger(preferredY, 0, mapData.height - 1);
  if (isWalkable(mapData, startX, startY)) {
    return { x: startX, y: startY };
  }

  const maxRadius = Math.max(mapData.width, mapData.height);
  for (let radius = 1; radius < maxRadius; radius += 1) {
    for (let y = startY - radius; y <= startY + radius; y += 1) {
      for (let x = startX - radius; x <= startX + radius; x += 1) {
        if (Math.abs(x - startX) !== radius && Math.abs(y - startY) !== radius) {
          continue;
        }
        if (isWalkable(mapData, x, y)) {
          return { x, y };
        }
      }
    }
  }

  return { x: 0, y: 0 };
}

function createCreature(worldInstanceId: string, entityKey: string, x: number, y: number): WorldEntity {
  return {
    worldInstanceId,
    entityKey,
    entityType: "creature",
    layerId: surfaceLayer,
    x,
    y,
    z: null,
    homeX: x,
    homeY: y,
    state: "idle",
    behavior: "wander",
    metadataJson: {},
  };
}

function moveEntity(mapData: MapData, entity: WorldEntity, dx: number, dy: number): WorldEntity {
  const nextX = entity.x + dx;
  const nextY = entity.y + dy;
  if (!isWalkable(mapData, nextX, nextY)) {
    return entity;
  }
  return {
    ...entity,
    x: nextX,
    y: nextY,
    state: dx === 0 && dy === 0 ? "idle" : "moving",
  };
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
