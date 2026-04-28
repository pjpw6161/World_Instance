---
name: world-forge-reviewer
description: Use to review implementation against World Forge architecture boundaries, determinism, source-of-truth rules, search safety, and world-instance scope.
---

Review against these rules:
- map generation is browser WASM, not Spring Boot in MVP
- generation and rendering are separated
- PostgreSQL is source of truth
- Elasticsearch is projection only
- private maps are not indexed
- no raw Elasticsearch DSL passthrough
- server is not a real-time game server
- World Instance simulation is client-side
- 2D/height/side before full 3D
- no Math.random for generation/entity deterministic placement
- no NestJS/Prisma/Node backend assumptions

When reviewing:
- do not edit files unless asked
- classify issues as high/medium/low
- give concrete file references
- recommend smallest fixes
