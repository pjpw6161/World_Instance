import { defaultRecipe, type GenerationRecipe } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import { createDeterministicDevModule, createWorldForgeWasmEngine } from "../src";

function testEngine() {
  return createWorldForgeWasmEngine({
    moduleFactory: async () => createDeterministicDevModule(),
  });
}

function recipeWith(overrides: Partial<GenerationRecipe>): GenerationRecipe {
  return {
    ...defaultRecipe,
    ...overrides,
    features: {
      ...defaultRecipe.features,
      ...overrides.features,
    },
    algorithms: {
      ...defaultRecipe.algorithms,
      ...overrides.algorithms,
    },
    params: {
      ...defaultRecipe.params,
      ...overrides.params,
    },
  };
}

describe("WorldForgeWasmEngine wrapper", () => {
  it("loads a low-level engine module", async () => {
    const engine = testEngine();

    expect(engine.status()).toBe("unloaded");
    await engine.load();

    expect(engine.status()).toBe("ready");
    expect(engine.engineVersion()).toBe("0.1.0");
  });

  it("returns the same map hash for the same recipe", async () => {
    const engine = testEngine();
    const recipe = recipeWith({ width: 64, height: 64, seed: 777 });

    const first = await engine.generate(recipe);
    const second = await engine.generate(recipe);

    expect(first.mapHash).toBe(second.mapHash);
    expect(first.heightMap).toHaveLength(recipe.width * recipe.height);
    expect(first.terrainMap).toHaveLength(recipe.width * recipe.height);
    expect(first.collisionMap).toHaveLength(recipe.width * recipe.height);
    expect(first.costMap).toHaveLength(recipe.width * recipe.height);
  });

  it("usually returns a different hash for a different seed", async () => {
    const engine = testEngine();
    const first = await engine.generate(recipeWith({ width: 64, height: 64, seed: 777 }));
    const second = await engine.generate(recipeWith({ width: 64, height: 64, seed: 778 }));

    expect(first.mapHash).not.toBe(second.mapHash);
  });

  it("does not emit disabled forest or mountain terrain", async () => {
    const engine = testEngine();
    const map = await engine.generate(
      recipeWith({
        width: 64,
        height: 64,
        features: {
          ...defaultRecipe.features,
          forests: false,
          mountains: false,
        },
        params: {
          ...defaultRecipe.params,
          forestDensity: 1,
          mountainLevel: 0,
        },
      }),
    );

    expect(map.terrainMap).not.toContain("forest");
    expect(map.terrainMap).not.toContain("mountain");
  });

  it("rejects invalid recipes before calling the low-level module", async () => {
    const engine = testEngine();

    await expect(engine.generate(recipeWith({ width: 1 }))).rejects.toThrow("width");
  });
});
