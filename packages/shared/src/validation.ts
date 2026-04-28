import {
  CAVE_ALGORITHMS,
  FEATURE_KEYS,
  GENERATION_PARAM_LIMITS,
  MAP_SIZE_LIMITS,
  OBJECT_PLACEMENT_ALGORITHMS,
  ROAD_ALGORITHMS,
  SEED_LIMITS,
  TERRAIN_ALGORITHMS,
} from "./constants";
import type { AlgorithmSelection, EnabledFeatures, GenerationParams, GenerationRecipe } from "./types";

export type ValidationCode =
  | "INVALID_TYPE"
  | "MISSING_FIELD"
  | "UNKNOWN_FIELD"
  | "OUT_OF_RANGE"
  | "UNSUPPORTED_VALUE";

export interface ValidationIssue {
  code: ValidationCode;
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T; issues: [] }
  | { ok: false; issues: ValidationIssue[] };

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export function validateMapDimensions(width: unknown, height: unknown): ValidationIssue[] {
  return [
    ...validateIntegerRange(width, "width", MAP_SIZE_LIMITS.min, MAP_SIZE_LIMITS.max),
    ...validateIntegerRange(height, "height", MAP_SIZE_LIMITS.min, MAP_SIZE_LIMITS.max),
  ];
}

export function validateSeed(seed: unknown): ValidationIssue[] {
  return validateIntegerRange(seed, "seed", SEED_LIMITS.min, SEED_LIMITS.max);
}

export function validateEnabledFeatures(features: unknown): ValidationResult<EnabledFeatures> {
  if (!isRecord(features)) {
    return invalid([{ code: "INVALID_TYPE", path: "features", message: "features must be an object" }]);
  }

  const issues: ValidationIssue[] = [];
  for (const key of FEATURE_KEYS) {
    if (!(key in features)) {
      issues.push({ code: "MISSING_FIELD", path: `features.${key}`, message: "feature flag is required" });
    } else if (typeof features[key] !== "boolean") {
      issues.push({ code: "INVALID_TYPE", path: `features.${key}`, message: "feature flag must be a boolean" });
    }
  }

  for (const key of Object.keys(features)) {
    if (!includes(FEATURE_KEYS, key)) {
      issues.push({ code: "UNKNOWN_FIELD", path: `features.${key}`, message: "unknown feature flag" });
    }
  }

  if (issues.length > 0) {
    return invalid(issues);
  }

  return valid(features as unknown as EnabledFeatures);
}

export function validateAlgorithmSelection(algorithms: unknown): ValidationResult<AlgorithmSelection> {
  if (!isRecord(algorithms)) {
    return invalid([{ code: "INVALID_TYPE", path: "algorithms", message: "algorithms must be an object" }]);
  }

  const issues: ValidationIssue[] = [];
  issues.push(...validateEnumValue(algorithms.terrain, "algorithms.terrain", TERRAIN_ALGORITHMS));
  issues.push(...validateEnumValue(algorithms.cave, "algorithms.cave", CAVE_ALGORITHMS));
  issues.push(...validateEnumValue(algorithms.road, "algorithms.road", ROAD_ALGORITHMS));
  issues.push(
    ...validateEnumValue(
      algorithms.objectPlacement,
      "algorithms.objectPlacement",
      OBJECT_PLACEMENT_ALGORITHMS,
    ),
  );

  for (const key of Object.keys(algorithms)) {
    if (!["terrain", "cave", "road", "objectPlacement"].includes(key)) {
      issues.push({ code: "UNKNOWN_FIELD", path: `algorithms.${key}`, message: "unknown algorithm field" });
    }
  }

  if (issues.length > 0) {
    return invalid(issues);
  }

  return valid(algorithms as unknown as AlgorithmSelection);
}

export function validateGenerationParams(params: unknown): ValidationResult<GenerationParams> {
  if (!isRecord(params)) {
    return invalid([{ code: "INVALID_TYPE", path: "params", message: "params must be an object" }]);
  }

  const issues: ValidationIssue[] = [];
  for (const [key, limits] of Object.entries(GENERATION_PARAM_LIMITS)) {
    issues.push(...validateNumberRange(params[key], `params.${key}`, limits.min, limits.max));
  }

  for (const key of Object.keys(params)) {
    if (!(key in GENERATION_PARAM_LIMITS)) {
      issues.push({ code: "UNKNOWN_FIELD", path: `params.${key}`, message: "unknown generation parameter" });
    }
  }

  if (issues.length > 0) {
    return invalid(issues);
  }

  return valid(params as unknown as GenerationParams);
}

export function validateGenerationRecipe(recipe: unknown): ValidationResult<GenerationRecipe> {
  if (!isRecord(recipe)) {
    return invalid([{ code: "INVALID_TYPE", path: "recipe", message: "recipe must be an object" }]);
  }

  const issues: ValidationIssue[] = [];

  if (typeof recipe.engineVersion !== "string" || recipe.engineVersion.trim().length === 0) {
    issues.push({
      code: typeof recipe.engineVersion === "undefined" ? "MISSING_FIELD" : "INVALID_TYPE",
      path: "engineVersion",
      message: "engineVersion must be a non-empty string",
    });
  }

  issues.push(...validateSeed(recipe.seed));
  issues.push(...validateMapDimensions(recipe.width, recipe.height));

  const featuresResult = validateEnabledFeatures(recipe.features);
  if (!featuresResult.ok) {
    issues.push(...featuresResult.issues);
  }

  const algorithmResult = validateAlgorithmSelection(recipe.algorithms);
  if (!algorithmResult.ok) {
    issues.push(...algorithmResult.issues);
  }

  const paramsResult = validateGenerationParams(recipe.params);
  if (!paramsResult.ok) {
    issues.push(...paramsResult.issues);
  }

  for (const key of Object.keys(recipe)) {
    if (!["engineVersion", "seed", "width", "height", "features", "algorithms", "params"].includes(key)) {
      issues.push({ code: "UNKNOWN_FIELD", path: key, message: "unknown recipe field" });
    }
  }

  if (issues.length > 0) {
    return invalid(issues);
  }

  return valid(recipe as unknown as GenerationRecipe);
}

export function assertValidGenerationRecipe(recipe: unknown): GenerationRecipe {
  const result = validateGenerationRecipe(recipe);
  if (!result.ok) {
    throw new ValidationError(result.issues);
  }
  return result.value;
}

export function isGenerationRecipe(recipe: unknown): recipe is GenerationRecipe {
  return validateGenerationRecipe(recipe).ok;
}

function validateIntegerRange(value: unknown, path: string, min: number, max: number): ValidationIssue[] {
  if (typeof value === "undefined") {
    return [{ code: "MISSING_FIELD", path, message: `${path} is required` }];
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return [{ code: "INVALID_TYPE", path, message: `${path} must be an integer` }];
  }
  if (value < min || value > max) {
    return [{ code: "OUT_OF_RANGE", path, message: `${path} must be between ${min} and ${max}` }];
  }
  return [];
}

function validateNumberRange(value: unknown, path: string, min: number, max: number): ValidationIssue[] {
  if (typeof value === "undefined") {
    return [{ code: "MISSING_FIELD", path, message: `${path} is required` }];
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return [{ code: "INVALID_TYPE", path, message: `${path} must be a finite number` }];
  }
  if (value < min || value > max) {
    return [{ code: "OUT_OF_RANGE", path, message: `${path} must be between ${min} and ${max}` }];
  }
  return [];
}

function validateEnumValue<T extends string>(
  value: unknown,
  path: string,
  supportedValues: readonly T[],
): ValidationIssue[] {
  if (typeof value === "undefined") {
    return [{ code: "MISSING_FIELD", path, message: `${path} is required` }];
  }
  if (typeof value !== "string") {
    return [{ code: "INVALID_TYPE", path, message: `${path} must be a string` }];
  }
  if (!includes(supportedValues, value)) {
    return [{ code: "UNSUPPORTED_VALUE", path, message: `${value} is not supported` }];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function includes<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value, issues: [] };
}

function invalid<T>(issues: ValidationIssue[]): ValidationResult<T> {
  return { ok: false, issues };
}
