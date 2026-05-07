# ADR-006: Deterministic map hash contract

## Status

Accepted

## Context

World Forge needs a portfolio-visible way to prove that procedural generation is deterministic. Users can change seed, feature flags, algorithms, and parameters, then save the generated map as a version. The server stores recipe, stats, and `mapHash`, but the browser remains responsible for generation.

## Decision

`mapHash` is treated as the deterministic content identity of a generated `MapData`.

- Same recipe and same engine version should produce the same `mapHash`.
- Changing seed, algorithm selection, feature flags, or generation parameters should change the generated map when the chosen algorithm uses that input.
- Spring Boot validates and stores `recipe`, `stats`, and `mapHash`, but does not regenerate maps as the primary source of truth.
- The frontend includes a Determinism / Performance view for manual portfolio demonstration.

## Consequences

- Saved map versions can be checked against regenerated browser output.
- Smoke tests and manual tests can assert stable `mapHash` behavior.
- Engine changes that alter output are visible and should be treated as generation-version changes.
- The TypeScript fallback must remain clearly labeled because release behavior depends on the WASM artifact.
