# Coding Standards

## General

- Keep changes small and phase-scoped.
- Prefer explicit types.
- Do not mix generation, rendering, API, and persistence responsibilities.
- Update docs when architecture changes.

## TypeScript

- Use strict TypeScript.
- Shared contracts live in `packages/shared`.
- UI components should not implement generation algorithms.
- API clients should have typed request/response definitions.

## C++/WASM

- Use C++17.
- Keep deterministic logic isolated and tested.
- Avoid hidden global random state.
- Expose a small stable interface.
- Do not write renderer-specific code in the engine.

## Java/Spring Boot

- Java 21 preferred unless local tooling requires Java 17.
- Use layered packages: controller, service, repository, domain, dto.
- Use Bean Validation on request DTOs.
- Keep raw JSON fields documented.
- Do not pass raw Elasticsearch queries from API requests.

## SQL/PostgreSQL

- Keep stable fields as columns.
- Use JSONB for recipe/stats/entity metadata.
- Add indexes for owner, visibility, project, version.

## Elasticsearch

- Treat indexes as rebuildable projections.
- Index only public maps.
- Keep mapping and indexing code explicit.
- Prefer safe DTO -> query translation.

## World Instance

- Browser simulates.
- Server persists snapshots/state.
- No combat or server tick loop in MVP.
