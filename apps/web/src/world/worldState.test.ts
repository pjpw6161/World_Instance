import { sampleMapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import {
  createInitialWorldEntities,
  findPath,
  isWalkable,
  movePlayer,
  tickWanderingEntities,
  type WorldEntity,
} from "./worldState";

describe("world instance client state", () => {
  it("blocks player movement into collision tiles", () => {
    const entities = createInitialWorldEntities("world-1", sampleMapData);
    const moved = movePlayer(sampleMapData, entities, 0, 1);

    expect(isWalkable(sampleMapData, 1, 1)).toBe(false);
    expect(moved.find((entity) => entity.entityType === "player")).toMatchObject({ x: 1, y: 0 });
  });

  it("allows player movement onto walkable tiles", () => {
    const entities = createInitialWorldEntities("world-1", sampleMapData);
    const moved = movePlayer(sampleMapData, entities, -1, 1);

    expect(moved.find((entity) => entity.entityType === "player")).toMatchObject({ x: 0, y: 1 });
  });

  it("wanders deterministically for the same world time", () => {
    const entities = createInitialWorldEntities("world-1", sampleMapData);
    const first = tickWanderingEntities(sampleMapData, entities, 12);
    const second = tickWanderingEntities(sampleMapData, entities, 12);

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
});

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
    state: "idle",
    behavior: entityType === "player" ? "manual" : "wander",
    metadataJson: {},
  };
}
