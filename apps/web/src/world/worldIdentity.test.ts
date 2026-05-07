import { sampleMapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import { createWorldIdentity, summarizeLivingWorld } from "./worldIdentity";
import type { WorldEntity } from "./worldState";

describe("world identity", () => {
  it("derives stable ownership markers and a suggested name", () => {
    const entities = [
      entityAt("player", "player", 1, 0),
      entityAt("creature-1", "creature", 0, 1),
      entityAt("creature-2", "creature", 0, 1),
    ];

    const first = createWorldIdentity(sampleMapData, entities, {
      worldInstanceId: "world-1",
      worldName: "World Instance",
    });
    const second = createWorldIdentity(sampleMapData, entities, {
      worldInstanceId: "world-1",
      worldName: "World Instance",
    });

    expect(first).toEqual(second);
    expect(first.base).toMatchObject({ x: 0, y: 1, layerId: "surface" });
    expect(first.core).toEqual(first.base);
    expect(first.crest).toEqual(second.crest);
    expect(first.crest.motif).toBeTruthy();
    expect(first.landmark.label).toBeTruthy();
    expect(first.regions.length).toBeGreaterThan(0);
    expect(first.regions.every((region) => region.radius > 0)).toBe(true);
    expect(first.pois.map((poi) => poi.label)).toContain("던전 코어");
    expect(first.pois.length).toBeGreaterThanOrEqual(2);
    expect(first.pois.length).toBeLessThanOrEqual(5);
    expect(first.stickers.map((sticker) => sticker.label)).not.toContain("First Visit");
    expect(first.stickers.map((sticker) => sticker.label)).not.toContain("Favorite Spot");
    expect(first.stickers.map((sticker) => sticker.label)).not.toContain("Most Active Area");
    expect(first.stickers.length).toBeLessThanOrEqual(2);
    expect(first.suggestedName).toContain(" ");
    expect(first.badges.map((badge) => badge.label)).toContain("생명체의 보금자리");
  });

  it("summarizes living stats from MapData and entity layers", () => {
    const entities = [
      entityAt("player", "player", 1, 0),
      entityAt("creature-1", "creature", 0, 1),
      { ...entityAt("creature-2", "creature", 0, 1), layerId: "cave" },
    ];

    const livingStats = summarizeLivingWorld({
      ...sampleMapData,
      portalList: [
        {
          id: "surface-cave",
          fromLayerId: "surface",
          toLayerId: "cave",
          x: 0,
          y: 1,
          targetX: 1,
          targetY: 0,
        },
      ],
    }, entities);

    expect(livingStats).toMatchObject({
      creatureCount: 2,
      surfaceCreatureCount: 1,
      caveCreatureCount: 1,
      portalCount: 1,
    });
    expect(livingStats.reachableAreaRatio).toBeGreaterThan(0);
  });

  it("marks portal worlds with portal crest and atlas POI", () => {
    const identity = createWorldIdentity({
      ...sampleMapData,
      stats: {
        ...sampleMapData.stats,
        caveAreaRatio: 0.12,
      },
      portalList: [
        {
          id: "surface-cave",
          fromLayerId: "surface",
          toLayerId: "cave",
          x: 0,
          y: 1,
          targetX: 1,
          targetY: 0,
        },
      ],
    }, [entityAt("player", "player", 1, 0)], {
      worldInstanceId: "portal-world",
      worldName: "Portal World",
    });

    expect(identity.crest.motif).toBe("portal");
    expect(identity.badges.map((badge) => badge.label)).toContain("문에 닿은 세계");
    expect(identity.pois.map((poi) => poi.label)).toContain("달문");
    expect(identity.stickers.map((sticker) => sticker.label)).toContain("달문 인장");
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
    maxSlope: entityType === "player" ? 0.35 : 0.2,
    state: "idle",
    behavior: entityType === "player" ? "manual" : "wander",
    metadataJson: {},
  };
}
