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
