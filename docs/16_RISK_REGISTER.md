# Risk Register

## R1: Scope creep into game development

Mitigation: no combat, no multiplayer, no complex art assets in MVP.

## R2: 3D too early

Mitigation: require 2D/height/side views and MapData contract before 3D.

## R3: WASM integration delays

Mitigation: create skeleton early; allow temporary dev fallback clearly labeled non-production.

## R4: Elasticsearch misuse as database

Mitigation: AGENTS.md and reviewer skill enforce PostgreSQL source-of-truth rule.

## R5: Client-side stats manipulation

Mitigation: MVP accepts client stats; later add server-side WASM validation before public indexing.

## R6: Entity simulation becomes server burden

Mitigation: server only persists state in MVP.
