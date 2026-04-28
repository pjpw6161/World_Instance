import type { MapData } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import { assertGeneratedMapMatchesStoredHash } from "./mapIntegrity";

const mapData: MapData = {
  width: 1,
  height: 1,
  heightMap: [0.5],
  terrainMap: ["grass"],
  objectList: [],
  collisionMap: [false],
  costMap: [1],
  portalList: [],
  stats: {
    waterRatio: 0,
    landRatio: 1,
    forestRatio: 0,
    mountainRatio: 0,
    treeCount: 0,
    roadLength: 0,
    caveAreaRatio: 0,
    villageCount: 0,
    blockedRatio: 0,
    generationTimeMs: 0,
  },
  mapHash: "expected-hash",
};

describe("map integrity", () => {
  it("accepts a generated map when the stored mapHash matches", () => {
    expect(() => assertGeneratedMapMatchesStoredHash(mapData, "expected-hash")).not.toThrow();
  });

  it("rejects a generated map when the stored mapHash differs", () => {
    expect(() => assertGeneratedMapMatchesStoredHash(mapData, "different-hash")).toThrow(
      "does not match stored mapHash",
    );
  });
});
