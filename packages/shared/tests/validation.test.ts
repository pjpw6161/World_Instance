import { describe, expect, it } from "vitest";
import {
  assertValidGenerationRecipe,
  defaultRecipe,
  validateAlgorithmSelection,
  validateEnabledFeatures,
  validateGenerationRecipe,
  validateMapDimensions,
  validateSeed,
  ValidationError,
} from "../src";

describe("generation recipe validation", () => {
  it("accepts the default recipe", () => {
    const result = validateGenerationRecipe(defaultRecipe);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.engineVersion).toBe("0.1.0");
    }
  });

  it("rejects map sizes outside the supported range", () => {
    expect(validateMapDimensions(63, 256)).toEqual([
      expect.objectContaining({ code: "OUT_OF_RANGE", path: "width" }),
    ]);
    expect(validateMapDimensions(256, 513)).toEqual([
      expect.objectContaining({ code: "OUT_OF_RANGE", path: "height" }),
    ]);
    expect(validateMapDimensions(128.5, 256)).toEqual([
      expect.objectContaining({ code: "INVALID_TYPE", path: "width" }),
    ]);
  });

  it("rejects invalid seeds", () => {
    expect(validateSeed(-1)).toEqual([expect.objectContaining({ code: "OUT_OF_RANGE", path: "seed" })]);
    expect(validateSeed(4_294_967_296)).toEqual([
      expect.objectContaining({ code: "OUT_OF_RANGE", path: "seed" }),
    ]);
    expect(validateSeed(12.5)).toEqual([expect.objectContaining({ code: "INVALID_TYPE", path: "seed" })]);
  });

  it("rejects missing, non-boolean, and unknown feature flags", () => {
    const result = validateEnabledFeatures({
      ...defaultRecipe.features,
      trees: "yes",
      weather: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "INVALID_TYPE", path: "features.trees" }),
          expect.objectContaining({ code: "UNKNOWN_FIELD", path: "features.weather" }),
        ]),
      );
    }

    const missingResult = validateEnabledFeatures({ ...defaultRecipe.features, villages: undefined });
    expect(missingResult.ok).toBe(false);
  });

  it("rejects unsupported algorithms", () => {
    const result = validateAlgorithmSelection({
      ...defaultRecipe.algorithms,
      terrain: "perlin-world",
      road: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "UNSUPPORTED_VALUE", path: "algorithms.terrain" }),
          expect.objectContaining({ code: "INVALID_TYPE", path: "algorithms.road" }),
        ]),
      );
    }
  });

  it("throws a validation error from assertValidGenerationRecipe", () => {
    expect(() => assertValidGenerationRecipe({ ...defaultRecipe, seed: "abc" })).toThrow(ValidationError);
  });
});
