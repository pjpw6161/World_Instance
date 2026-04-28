# ADR-002: PostgreSQL as source of truth

## Status

Accepted

## Decision

PostgreSQL stores authoritative recipes, map versions, visibility, world instances, and entity state.

## Consequences

Elasticsearch indexes can be rebuilt from PostgreSQL. API ownership and visibility rules remain transactional.
