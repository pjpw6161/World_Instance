# ADR-007: Lightweight client toy interactions

## Status

Accepted

## Context

World Instances now include simple creature movement, portals, respawn, and lightweight toy combat visuals. These interactions improve portfolio demo value, but World Forge must not turn Spring Boot into a real-time game server.

## Decision

Living-world interactions remain client-side for MVP.

- Browser code advances movement, target selection, encounter checks, toy combat, and respawn.
- Spring Boot stores and restores snapshots: world instance state and entity state.
- Server code must not run continuous simulation ticks.
- Toy combat remains visual and lightweight: no item economy, XP system, skill tree, loot, or server-authoritative combat loop.

## Consequences

- The demo feels alive without requiring websocket infrastructure or authoritative simulation.
- Save/load remains straightforward because the server stores snapshots.
- Multiplayer, anti-cheat, and authoritative combat are explicitly out of scope.
- Future work can replace the client simulation with an authoritative model only if the product goal changes.
