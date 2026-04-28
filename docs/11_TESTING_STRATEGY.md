# Testing Strategy

## Must-test areas

### Determinism

- same recipe produces same mapHash
- different seed generally produces different mapHash
- disabled features do not appear
- engineVersion is included in saved recipe

### Frontend

- editor updates recipe correctly
- view mode changes do not regenerate unexpectedly
- renderer consumes MapData only
- world movement respects collisionMap

### WASM wrapper

- load state
- invalid recipe rejected
- map size limits enforced
- generated arrays have expected lengths

### Spring Boot

- validation errors
- map save/load
- map versioning
- publish/unpublish
- world instance save/load
- no private map indexing

### Elasticsearch

- public maps are searchable
- private maps are not indexed
- filters work
- facets return expected counts

## Recommended tools

- Frontend: Vitest, Testing Library
- Backend: JUnit 5, Spring Boot Test, Testcontainers later
- C++: lightweight native tests or wrapper-level integration tests
- E2E later: Playwright

## CI smoke commands

Initial commands may evolve, but Codex should keep commands documented in README and AGENTS.

```txt
frontend typecheck/test
backend test
wasm build/test
```

## MVP API smoke test

`E2eSmokeApiIntegrationTests` is the first automated end-to-end smoke test for the API layer. It runs the core authenticated user flow through Spring Boot controllers and services:

- sign up and log in
- save and load a map
- list and load map versions
- create, save, and reload a World Instance snapshot
- confirm private maps are owner-only and absent from search
- publish a map and confirm it becomes searchable

The smoke test uses the repository's existing Spring test datasource:

```txt
spring.datasource.url=jdbc:h2:mem:worldforge;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1
```

This keeps the API smoke fast and verifies the JPA persistence contract in PostgreSQL compatibility mode. A Docker-backed PostgreSQL smoke should be added separately for release or CI environments that can reliably run containers.

Elasticsearch is replaced with an in-memory `MapSearchIndexClient` test bean in this smoke test. The goal is to validate the API projection flow and public/private indexing rules without requiring a local Elasticsearch node for every backend test run. Real Elasticsearch behavior remains covered by manual/release smoke checks and should get a separate Docker-backed smoke test later.
