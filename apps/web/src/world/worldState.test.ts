import { sampleMapData, type MapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import {
  activatePlayerPortal,
  createInitialWorldEntities,
  findPath,
  fromEntityStateDto,
  isWalkable,
  movePlayer,
  serializeWorldEntities,
  tickWanderingEntities,
  type WorldEntity,
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

    expect(firstMove[0]).toMatchObject({ x: 1, y: 0, state: "moving" });
    expect(firstMove[0].metadataJson.lastMoveCost).toBe(4);
    expect(firstMove[0].metadataJson.nextMoveAt).toBe(4);
    expect(waitingMove[0]).toMatchObject({ x: 1, y: 0, state: "waiting" });
    expect(readyMove[0]).toMatchObject({ x: 2, y: 0, state: "moving" });
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
      state: "transitioning",
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
      state: "transitioning",
      metadataJson: { lastPortalId: "surface-to-cave" },
    });
    expect(restored).toMatchObject({
      entityKey: "player",
      layerId: "cave",
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

    expect(movedPlayer[0]).toMatchObject({ x: 1, y: 0, state: "moving" });
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
