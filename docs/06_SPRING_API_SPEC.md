# Spring Boot API Spec

## Role

Spring Boot stores and manages service data. It is not the primary map generator and not a real-time game server.

## Modules

```txt
auth            later
users           user profile later
maps            map projects and versions
world           world instances and entity states
search          safe search API over Elasticsearch
indexing        PostgreSQL -> Elasticsearch projection
common          errors, validation, response wrappers
```

## MVP endpoints

### Health

```txt
GET /api/health
```

### Maps

```txt
POST /api/maps
GET  /api/maps/{projectId}
GET  /api/me/maps
PATCH /api/maps/{projectId}
```

### Versions

```txt
POST /api/maps/{projectId}/versions
GET  /api/maps/{projectId}/versions
GET  /api/map-versions/{versionId}
```

### Publish

```txt
POST /api/maps/{projectId}/publish
POST /api/maps/{projectId}/unpublish
```

### World Instances

```txt
POST /api/world-instances
GET  /api/world-instances/{id}
PUT  /api/world-instances/{id}/state
GET  /api/me/world-instances
```

### Search

```txt
GET  /api/search/maps
GET  /api/search/maps/facets
GET  /api/search/maps/{mapVersionId}/similar later
```

## Request rules

- Do not accept raw Elasticsearch Query DSL.
- Do not accept unbounded map sizes.
- Validate recipe fields and ranges.
- Store recipe/stats/mapHash as JSON where appropriate.
- Private maps must not be indexed.

## Development user

Before auth exists, use a documented dev user or local-only owner strategy. Mark all endpoints needing auth later with TODO and tests.

## Error format

Use consistent JSON errors:

```json
{
  "code": "INVALID_RECIPE",
  "message": "width must be between 64 and 512",
  "details": []
}
```
