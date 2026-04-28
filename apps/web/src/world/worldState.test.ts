import { sampleMapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import { createInitialWorldEntities, isWalkable, movePlayer, tickWanderingEntities } from "./worldState";

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
});
