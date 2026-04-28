import { defaultRecipe } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import {
  createInitialRecipe,
  createRandomSeed,
  withAlgorithm,
  withFeature,
  withMapSize,
  withParam,
  withSeed,
} from "./editorState";

describe("editor recipe state", () => {
  it("creates a mutable copy of the default recipe", () => {
    const recipe = createInitialRecipe();

    expect(recipe).toEqual(defaultRecipe);
    expect(recipe.features).not.toBe(defaultRecipe.features);
    expect(recipe.algorithms).not.toBe(defaultRecipe.algorithms);
    expect(recipe.params).not.toBe(defaultRecipe.params);
  });

  it("updates size, seed, features, algorithms, and params without mutating the source", () => {
    const recipe = createInitialRecipe();
    const next = withParam(
      withAlgorithm(
        withFeature(withSeed(withMapSize(recipe, 128, 512), 42), "caves", true),
        "terrain",
        "radial-island",
      ),
      "waterLevel",
      0.5,
    );

    expect(next.width).toBe(128);
    expect(next.height).toBe(512);
    expect(next.seed).toBe(42);
    expect(next.features.caves).toBe(true);
    expect(next.algorithms.terrain).toBe("radial-island");
    expect(next.params.waterLevel).toBe(0.5);
    expect(recipe.features.caves).toBe(false);
  });

  it("uses crypto-backed seed generation", () => {
    const seed = createRandomSeed();

    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(4_294_967_295);
  });
});
