# Architecture

## Overview

```txt
+------------------------------+
| Browser                      |
| - React/Vite UI              |
| - C++/WASM map engine        |
| - Canvas 2D renderer         |
| - 3D renderer later          |
| - World Instance simulation  |
+---------------+--------------+
                |
                | HTTPS JSON API
                v
+------------------------------+
| Spring Boot API              |
| - validation                 |
| - users/auth later           |
| - map projects/versions      |
| - world instances/entities   |
| - search proxy               |
| - Elasticsearch indexing     |
+---------+--------------------+
          |             |
          |             v
          |      +----------------+
          |      | Elasticsearch  |
          |      | search index   |
          |      +----------------+
          v
+----------------+
| PostgreSQL     |
| source of truth|
+----------------+
```

## Responsibility split

### Browser

- run WASM map generation
- render maps
- run local world movement/simulation
- generate map stats and hash
- optionally generate thumbnail
- call API for save/publish/search

### Spring Boot API

- validate API input
- persist map projects and versions
- persist world instances and entity states
- enforce ownership and visibility
- publish/unpublish maps
- index public maps into Elasticsearch
- expose safe search APIs

### PostgreSQL

- authoritative data store
- recipes, stats, versions, ownership, visibility
- world instance and entity state

### Elasticsearch

- public map search
- filtering by feature/algorithm/stats
- facets/aggregations
- similar map search later

## Critical constraints

1. The engine must return data, not UI.
2. The renderer must consume data, not generation internals.
3. The server must not continuously simulate entities.
4. Private maps must not be indexed into public search.
5. Elasticsearch can be rebuilt from PostgreSQL.

## Suggested top-level repo layout

```txt
apps/
  web/
  api/
packages/
  shared/
engine/
  wasm-engine/
infra/
  docker-compose.yml
  elasticsearch/
docs/
.agents/skills/
```
