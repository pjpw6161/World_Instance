# PostgreSQL Schema Spec

PostgreSQL is the source of truth.

## Tables

### users

MVP may use a dev user. Auth later.

```txt
id
email
nickname
created_at
updated_at
```

### map_projects

```txt
id
owner_id
title
description
visibility            private | public
current_version_id
created_at
updated_at
```

### map_versions

```txt
id
project_id
engine_version
seed
width
height
recipe_json           jsonb
stats_json            jsonb
map_hash
thumbnail_url nullable
created_at
```

### world_instances

```txt
id
owner_id
map_version_id
name
world_time
last_saved_at
created_at
updated_at
```

### entity_states

```txt
id
world_instance_id
entity_key
entity_type
layer_id
x
y
z nullable
home_x nullable
home_y nullable
state
behavior
metadata_json jsonb
created_at
updated_at
```

### map_likes later

```txt
id
user_id
project_id
created_at
unique(user_id, project_id)
```

### map_presets later

```txt
id
owner_id
name
recipe_json
created_at
updated_at
```

## Storage policy

Do not store the full generated tile grid by default. Store:

- recipe
- engineVersion
- stats
- mapHash
- thumbnailUrl optional

If exact historical preservation becomes necessary, add an optional compressed artifact table later.

## JSONB usage

Allowed for recipe/stats/entity metadata in early versions. Keep stable top-level columns for common filters such as width, height, visibility, owner, seed, and engineVersion.
