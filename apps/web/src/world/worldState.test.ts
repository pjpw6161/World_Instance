import { sampleMapData, type MapData, type TerrainType } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import {
  activatePlayerPortal,
  createInitialWorldEntities,
  findPath,
  fromEntityStateDto,
  isWalkable,
  movePlayer,
  movementCostAt,
  serializeWorldEntities,
  setPlayerAutoExplore,
  tickWanderingEntities,
  type WorldEntity,
  type WorldNavigationContext,
} from "./worldState";

describe("world instance client state", () => {
  it("blocks player movement into collision tiles", () => {
    const mapData = withoutObjects(sampleMapData);
    const entities = createInitialWorldEntities("world-1", mapData);
    const moved = movePlayer(mapData, entities, 0, 1);

    expect(isWalkable(mapData, 1, 1)).toBe(false);
    expect(moved.find((entity) => entity.entityType === "player")).toMatchObject({ x: 1, y: 0 });
  });

  it("allows player movement onto walkable tiles", () => {
    const mapData = withoutObjects(sampleMapData);
    const entities = createInitialWorldEntities("world-1", mapData);
    const moved = movePlayer(mapData, entities, -1, 1);

    expect(moved.find((entity) => entity.entityType === "player")).toMatchObject({ x: 0, y: 1 });
  });

  it("wanders deterministically for the same world time", () => {
    const mapData = withoutObjects(sampleMapData);
    const entities = createInitialWorldEntities("world-1", mapData);
    const first = tickWanderingEntities(mapData, entities, 12);
    const second = tickWanderingEntities(mapData, entities, 12);

    expect(first).toEqual(second);
  });

  it("spawns player and creatures on distinct safe walkable tiles", () => {
    const mapData = spawnMap(12, 12);

    const entities = createInitialWorldEntities("world-spawn", mapData);
    const uniquePositions = new Set(entities.map((entity) => `${entity.x}:${entity.y}`));

    expect(uniquePositions.size).toBe(entities.length);
    for (const entity of entities) {
      const tileIndex = entity.y * mapData.width + entity.x;
      expect(isWalkable(mapData, entity.x, entity.y, entity)).toBe(true);
      expect(mapData.terrainMap[tileIndex]).not.toBe("water");
      expect(mapData.terrainMap[tileIndex]).not.toBe("deep-water");
      expect(mapData.terrainMap[tileIndex]).not.toBe("cave-wall");
      expect(mapData.collisionMap[tileIndex]).toBe(false);
      expect(mapData.objectList.some((object) => object.x === entity.x && object.y === entity.y && object.type === "tree")).toBe(false);
    }
  });

  it("uses entity identity when selecting deterministic spawn candidates", () => {
    const mapData = spawnMap(16, 16);

    const first = createInitialWorldEntities("world-spawn-a", mapData);
    const second = createInitialWorldEntities("world-spawn-a", mapData);

    expect(first).toEqual(second);
    expect(first.find((entity) => entity.entityKey === "creature-1")).not.toMatchObject(
      first.find((entity) => entity.entityKey === "creature-2") ?? {},
    );
  });

  it("relocates a wandering creature that starts on an invalid tile", () => {
    const mapData = spawnMap(10, 10);
    const entity = {
      ...entityAt("creature-1", "creature", 0, 0),
      metadataJson: {},
    };

    const [relocated] = tickWanderingEntities(mapData, [entity], 10);

    expect(relocated).toMatchObject({ state: "choosingTarget" });
    expect(relocated.x).not.toBe(0);
    expect(relocated.y).not.toBe(0);
    expect(isWalkable(mapData, relocated.x, relocated.y, relocated)).toBe(true);
  });

  it("replaces unreachable wander targets with reachable region targets", () => {
    const mapData = spawnMap(14, 14);
    const entity = {
      ...entityAt("creature-1", "creature", 6, 6),
      metadataJson: {
        recentPositions: [{ x: 6, y: 6 }],
        wanderTarget: { x: 0, y: 0 },
      },
    };

    const [moved] = tickWanderingEntities(mapData, [entity], 10);
    const target = moved.metadataJson.wanderTarget as { x?: number; y?: number } | null;

    expect(moved.state).toBe("wandering");
    expect(target).toBeTruthy();
    expect(target).not.toMatchObject({ x: 0, y: 0 });
  });

  it("avoids immediate two-tile oscillation when choosing a wander step", () => {
    const mapData = spawnMap(14, 14);
    const entity = {
      ...entityAt("creature-1", "creature", 6, 6),
      metadataJson: {
        recentPositions: [{ x: 5, y: 6 }, { x: 6, y: 6 }],
        wanderTarget: { x: 5, y: 6 },
      },
    };

    const [moved] = tickWanderingEntities(mapData, [entity], 10);

    expect(moved).not.toMatchObject({ x: 5, y: 6 });
  });

  it("selects a long-range creature target and stores path intent", () => {
    const mapData = spawnMap(28, 28);
    const entity = {
      ...entityAt("creature-1", "creature", 6, 6),
      metadataJson: {
        movementProfile: "scout",
        recentPositions: [{ x: 6, y: 6 }],
      },
    };

    const [moved] = tickWanderingEntities(mapData, [entity], 20);
    const target = moved.metadataJson.currentTarget as { x?: number; y?: number; label?: string } | null;
    const path = moved.metadataJson.currentPath as Array<{ x: number; y: number }> | undefined;

    expect(moved.state).toMatch(/wandering|traveling/);
    expect(target?.x).toBeTypeOf("number");
    expect(target?.y).toBeTypeOf("number");
    expect(distance(6, 6, target?.x ?? 6, target?.y ?? 6)).toBeGreaterThanOrEqual(8);
    expect(path?.length).toBeGreaterThan(0);
  });

  it("auto explores the player toward world POIs", () => {
    const mapData = spawnMap(24, 24);
    const [player] = setPlayerAutoExplore([entityAt("player", "player", 5, 5)], true);
    const navigation: WorldNavigationContext = {
      pois: [{
        id: "poi-crystal-hollow",
        label: "Crystal Hollow",
        x: 16,
        y: 16,
        layerId: "surface",
        kind: "poi",
        tone: "cave",
        priority: 2,
      }],
    };

    const [moved] = tickWanderingEntities(mapData, [player], 30, navigation);
    const target = moved.metadataJson.currentTarget as { label?: string; x?: number; y?: number } | null;

    expect(moved.entityType).toBe("player");
    expect(moved.behavior).toBe("autoExplore");
    expect(moved.state).toBe("traveling");
    expect(target?.label).toBe("Crystal Hollow");
  });

  it("records investigated player targets for persistence", () => {
    const player = {
      ...entityAt("player", "player", 5, 5),
      behavior: "autoExplore",
      state: "traveling" as const,
      metadataJson: {
        currentTarget: { id: "region-whisper-grove", label: "Whisper Grove", x: 5, y: 5, layerId: "surface", kind: "region" },
      },
    };

    const [investigating] = tickWanderingEntities(spawnMap(12, 12), [player], 40);
    const [payload] = serializeWorldEntities([investigating]);

    expect(investigating.state).toBe("investigating");
    expect(payload.metadataJson.visitedTargetIds).toEqual(["region-whisper-grove"]);
    expect(payload.metadataJson.lastInvestigatedTarget).toMatchObject({ label: "Whisper Grove" });
  });

  it("keeps defeated creatures inert until their stored respawn time", () => {
    const mapData = spawnMap(16, 16);
    const entity = {
      ...entityAt("creature-1", "creature", 6, 6),
      state: "defeated" as const,
      metadataJson: {
        hp: 0,
        maxHp: 3,
        respawnAt: 30,
        respawnCount: 1,
        currentTarget: { id: "old-target", label: "Old Target", x: 12, y: 12, layerId: "surface" },
        currentPath: [{ x: 7, y: 6 }],
      },
    };

    const [held] = tickWanderingEntities(mapData, [entity], 20);
    const [payload] = serializeWorldEntities([held]);

    expect(held).toMatchObject({ state: "defeated", x: 6, y: 6 });
    expect(held.metadataJson.currentPath).toEqual([]);
    expect(payload.metadataJson.respawnAt).toBe(30);
  });

  it("respawns creatures through the valid spawn system when respawnAt is reached", () => {
    const mapData = spawnMap(16, 16);
    const entity = {
      ...entityAt("creature-1", "creature", 6, 6),
      state: "respawning" as const,
      metadataJson: {
        hp: 0,
        maxHp: 3,
        respawnAt: 40,
        respawnCount: 1,
      },
    };

    const [respawned] = tickWanderingEntities(mapData, [entity], 40);
    const tileIndex = respawned.y * mapData.width + respawned.x;

    expect(respawned.state).toBe("choosingTarget");
    expect(respawned.metadataJson.hp).toBe(3);
    expect(respawned.metadataJson.respawnAt).toBeNull();
    expect(respawned.metadataJson.respawnCount).toBe(2);
    expect(isWalkable(mapData, respawned.x, respawned.y, respawned)).toBe(true);
    expect(mapData.terrainMap[tileIndex]).not.toBe("water");
    expect(mapData.collisionMap[tileIndex]).toBe(false);
    expect(respawned).not.toMatchObject({ x: 6, y: 6 });
  });

  it("does not overwrite short-lived combat placeholder states during wandering ticks", () => {
    const mapData = spawnMap(16, 16);
    const hitStun = {
      ...entityAt("creature-1", "creature", 6, 6),
      state: "hitStun" as const,
      metadataJson: {
        hitStunUntil: 20,
      },
    };
    const attacking = {
      ...entityAt("creature-2", "creature", 7, 7),
      state: "attacking" as const,
      metadataJson: {
        attackUntil: 20,
      },
    };

    const [heldHitStun, heldAttacking] = tickWanderingEntities(mapData, [hitStun, attacking], 10);

    expect(heldHitStun).toMatchObject({ state: "hitStun", x: 6, y: 6 });
    expect(heldAttacking).toMatchObject({ state: "attacking", x: 7, y: 7 });
  });

  it("transitions through portals between surface and cave layers", () => {
    const mapData = {
      ...sampleMapData,
      collisionMap: [false, false, false, false],
      costMap: [1, 1, 1, 1],
      portalList: [
        {
          id: "surface-to-cave",
          fromLayerId: "surface",
          toLayerId: "cave",
          x: 0,
          y: 1,
          targetX: 1,
          targetY: 0,
        },
        {
          id: "cave-to-surface",
          fromLayerId: "cave",
          toLayerId: "surface",
          x: 1,
          y: 0,
          targetX: 0,
          targetY: 1,
        },
      ],
    };
    const entities = [entityAt("player", "player", 1, 0)];

    const moved = movePlayer(mapData, entities, -1, 1);

    expect(moved[0]).toMatchObject({ layerId: "cave", x: 1, y: 0, state: "transitioning" });
    expect(moved[0].metadataJson.lastPortalId).toBe("surface-to-cave");

    const returned = activatePlayerPortal(mapData, moved);

    expect(returned[0]).toMatchObject({ layerId: "surface", x: 0, y: 1, state: "transitioning" });
    expect(returned[0].metadataJson.lastPortalId).toBe("cave-to-surface");
  });

  it("uses costMap when finding a simple path", () => {
    const mapData = {
      ...sampleMapData,
      width: 3,
      height: 3,
      heightMap: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
      terrainMap: ["grass", "grass", "grass", "grass", "mountain", "grass", "grass", "grass", "grass"],
      collisionMap: [false, false, false, false, false, false, false, false, false],
      costMap: [1, 1, 1, 1, 9, 1, 1, 1, 1],
      portalList: [],
    } as const;
    const entity = entityAt("creature-1", "creature", 0, 1);

    const path = findPath(mapData, entity, { x: 2, y: 1 });

    expect(path[0]?.x).toBe(0);
    expect(path[0]?.y).not.toBe(1);
  });

  it("blocks trees as map objects even when the collision map tile is open", () => {
    const mapData: MapData = {
      ...sampleMapData,
      width: 2,
      height: 1,
      heightMap: [0.2, 0.2],
      terrainMap: ["grass", "forest"],
      objectList: [{ id: "tree-1", type: "tree", layerId: "surface", x: 1, y: 0 }],
      collisionMap: [false, false],
      costMap: [1, 4],
      portalList: [],
    };
    const entities = [entityAt("player", "player", 0, 0)];

    const moved = movePlayer(mapData, entities, 1, 0);

    expect(isWalkable(mapData, 1, 0, entities[0])).toBe(false);
    expect(moved[0]).toMatchObject({ x: 0, y: 0, state: "idle" });
  });

  it("applies movement cost as the next allowed movement time", () => {
    const mapData: MapData = {
      ...sampleMapData,
      width: 3,
      height: 1,
      heightMap: [0.2, 0.2, 0.2],
      terrainMap: ["road", "forest", "road"],
      objectList: [],
      collisionMap: [false, false, false],
      costMap: [1, 4, 1],
      portalList: [],
    };
    const entities = [entityAt("player", "player", 0, 0)];

    const firstMove = movePlayer(mapData, entities, 1, 0, 0);
    const waitingMove = movePlayer(mapData, firstMove, 1, 0, 1);
    const readyMove = movePlayer(mapData, firstMove, 1, 0, 4);

    expect(firstMove[0]).toMatchObject({ x: 1, y: 0, state: "traveling" });
    expect(firstMove[0].metadataJson.lastMoveCost).toBe(4);
    expect(firstMove[0].metadataJson.nextMoveAt).toBe(4);
    expect(waitingMove[0]).toMatchObject({ x: 1, y: 0, state: "traveling" });
    expect(readyMove[0]).toMatchObject({ x: 2, y: 0, state: "traveling" });
  });

  it("normalizes terrain movement rules from costMap and terrainMap", () => {
    const mapData: MapData = {
      ...sampleMapData,
      width: 5,
      height: 1,
      heightMap: [0.2, 0.2, 0.2, 0.2, 0.2],
      terrainMap: ["road", "grass", "forest", "water", "cave-wall"],
      objectList: [],
      collisionMap: [false, false, false, false, false],
      costMap: [9, 0, 1, 1, 1],
      portalList: [],
    };
    const player = entityAt("player", "player", 0, 0);

    expect(movementCostAt(mapData, player, 0, 0)).toBe(1);
    expect(movementCostAt(mapData, player, 1, 0)).toBe(2);
    expect(movementCostAt(mapData, player, 2, 0)).toBe(4);
    expect(movementCostAt(mapData, player, 3, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(movementCostAt(mapData, player, 4, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(isWalkable(mapData, 3, 0, player)).toBe(false);
    expect(isWalkable(mapData, 4, 0, player)).toBe(false);
  });

  it("avoids blocked objects when pathfinding for wandering entities", () => {
    const mapData: MapData = {
      ...sampleMapData,
      width: 3,
      height: 3,
      heightMap: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
      terrainMap: ["grass", "grass", "grass", "grass", "forest", "grass", "grass", "grass", "grass"],
      objectList: [{ id: "tree-1", type: "tree", layerId: "surface", x: 1, y: 1 }],
      collisionMap: [false, false, false, false, false, false, false, false, false],
      costMap: [1, 1, 1, 1, 4, 1, 1, 1, 1],
      portalList: [],
    };
    const entity = entityAt("creature-1", "creature", 0, 1);

    const path = findPath(mapData, entity, { x: 2, y: 1 });

    expect(path.length).toBeGreaterThan(0);
    expect(path).not.toContainEqual({ x: 1, y: 1 });
  });

  it("serializes and restores entity layer, state, and metadata", () => {
    const entity = {
      ...entityAt("player", "player", 1, 0),
      layerId: "cave",
      jumpHeight: 0.55,
      maxSlope: 0.22,
      state: "transitioning" as const,
      metadataJson: {
        lastPortalId: "surface-to-cave",
      },
    };

    const [payload] = serializeWorldEntities([entity]);
    const restored = fromEntityStateDto({
      id: "entity-state-1",
      worldInstanceId: "world-1",
      ...payload,
    });

    expect(payload).toMatchObject({
      entityKey: "player",
      layerId: "cave",
      jumpHeight: 0.55,
      maxSlope: 0.22,
      state: "transitioning",
      metadataJson: { lastPortalId: "surface-to-cave" },
    });
    expect(restored).toMatchObject({
      entityKey: "player",
      layerId: "cave",
      jumpHeight: 0.55,
      maxSlope: 0.22,
      state: "transitioning",
      metadataJson: { lastPortalId: "surface-to-cave" },
    });
  });

  it("blocks movement above an entity jumpHeight", () => {
    const mapData = {
      ...sampleMapData,
      collisionMap: [false, false, false, false],
      costMap: [1, 1, 1, 1],
    };
    const entities = [
      {
        ...entityAt("player", "player", 0, 0),
        jumpHeight: 0.1,
      },
    ];

    const moved = movePlayer(mapData, entities, 1, 0);

    expect(moved[0]).toMatchObject({ x: 0, y: 0, state: "idle" });
  });

  it("blocks movement above an entity maxSlope even when jumpHeight allows it", () => {
    const mapData: MapData = {
      ...sampleMapData,
      width: 2,
      height: 1,
      heightMap: [0.1, 0.45],
      terrainMap: ["grass", "mountain"],
      objectList: [],
      collisionMap: [false, false],
      costMap: [1, 1],
      portalList: [],
    };
    const entities = [
      {
        ...entityAt("player", "player", 0, 0),
        jumpHeight: 1,
        maxSlope: 0.2,
      },
    ];

    const moved = movePlayer(mapData, entities, 1, 0);

    expect(moved[0]).toMatchObject({ x: 0, y: 0, state: "idle" });
  });

  it("allows lower hills and gives entity types different slope ranges", () => {
    const mapData: MapData = {
      ...sampleMapData,
      width: 2,
      height: 1,
      heightMap: [0.1, 0.32],
      terrainMap: ["grass", "mountain"],
      objectList: [],
      collisionMap: [false, false],
      costMap: [1, 1],
      portalList: [],
    };
    const player = {
      ...entityAt("player", "player", 0, 0),
      jumpHeight: 1,
      maxSlope: 0.35,
    };
    const creature = {
      ...entityAt("creature-1", "creature", 0, 0),
      jumpHeight: 1,
      maxSlope: 0.2,
    };

    const movedPlayer = movePlayer(mapData, [player], 1, 0);
    const creaturePath = findPath(mapData, creature, { x: 1, y: 0 });

    expect(movedPlayer[0]).toMatchObject({ x: 1, y: 0, state: "traveling" });
    expect(creaturePath).toEqual([]);
  });

  it("routes pathfinding around high cliffs", () => {
    const mapData: MapData = {
      ...sampleMapData,
      width: 3,
      height: 3,
      heightMap: [0.1, 0.1, 0.1, 0.1, 0.7, 0.1, 0.1, 0.1, 0.1],
      terrainMap: ["grass", "grass", "grass", "grass", "mountain", "grass", "grass", "grass", "grass"],
      objectList: [],
      collisionMap: [false, false, false, false, false, false, false, false, false],
      costMap: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      portalList: [],
    };
    const entity = {
      ...entityAt("player", "player", 0, 1),
      maxSlope: 0.25,
    };

    const path = findPath(mapData, entity, { x: 2, y: 1 });

    expect(path.length).toBeGreaterThan(0);
    expect(path).not.toContainEqual({ x: 1, y: 1 });
  });
});

function withoutObjects(mapData: MapData): MapData {
  return {
    ...mapData,
    objectList: [],
  };
}

function spawnMap(width: number, height: number): MapData {
  const tileCount = width * height;
  const terrainMap: TerrainType[] = new Array<TerrainType>(tileCount).fill("grass");
  const heightMap = new Array(tileCount).fill(0.22);
  const collisionMap = new Array(tileCount).fill(false);
  const costMap = new Array(tileCount).fill(2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        terrainMap[index] = "water";
        collisionMap[index] = true;
        costMap[index] = 255;
      }
      if (x === 4 && y > 2 && y < height - 3) {
        terrainMap[index] = "forest";
        costMap[index] = 4;
      }
      if (x === 8 && y > 2 && y < height - 3) {
        terrainMap[index] = "road";
        costMap[index] = 1;
      }
    }
  }
  return {
    ...sampleMapData,
    width,
    height,
    heightMap,
    terrainMap,
    objectList: [{ id: "tree-1", type: "tree", layerId: "surface", x: 2, y: 2 }],
    collisionMap,
    costMap,
    portalList: [],
    mapHash: `spawn-map-${width}x${height}`,
  };
}

function entityAt(entityKey: string, entityType: WorldEntity["entityType"], x: number, y: number): WorldEntity {
  return {
    worldInstanceId: "world-1",
    entityKey,
    entityType,
    layerId: "surface",
    x,
    y,
    z: null,
    homeX: x,
    homeY: y,
    movementCostMultiplier: entityType === "player" ? 1 : 1.4,
    jumpHeight: entityType === "player" ? 1 : 0.25,
    maxSlope: entityType === "player" ? 0.35 : 0.2,
    state: "idle",
    behavior: entityType === "player" ? "manual" : "wander",
    metadataJson: {},
  };
}

function distance(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.abs(toX - fromX) + Math.abs(toY - fromY);
}
