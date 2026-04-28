# ADR-001: Browser WASM map generation

## Status

Accepted

## Context

The product requires fast interactive map generation when users adjust seed, features, algorithms, and parameters.

## Decision

The primary map generation engine runs in the browser as C++ compiled to WebAssembly.

## Consequences

- Faster local preview.
- Lower server compute load.
- Spring Boot focuses on data/service concerns.
- Need deterministic engine, wrapper, and validation.
