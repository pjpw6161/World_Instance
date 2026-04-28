# ADR-003: Elasticsearch as search projection

## Status

Accepted

## Decision

Elasticsearch stores searchable public map documents and aggregation fields, not primary source data.

## Consequences

Search is powerful while primary consistency remains in PostgreSQL. Indexing must handle publish/unpublish.
