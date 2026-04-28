# World Forge API

Spring Boot + Gradle service scaffold.

The API stores map projects and map versions. It does not generate maps, run World Instance simulation, implement authentication, or query Elasticsearch in this phase.

## Dev user strategy

Authentication is intentionally not implemented yet. All MVP map endpoints use a local development owner created on demand:

```txt
email: dev@worldforge.local
nickname: Local Dev User
```

This keeps ownership checks explicit while avoiding an auth dependency before the persistence flow is stable. Replace `DevUserProvider` when real authentication is introduced.

## PostgreSQL

Runtime database defaults match `infra/docker-compose.yml`:

```txt
url: jdbc:postgresql://localhost:5432/world_forge
user: world_forge
password: world_forge_dev
```

Override with:

```txt
WORLD_FORGE_DB_URL
WORLD_FORGE_DB_USER
WORLD_FORGE_DB_PASSWORD
WORLD_FORGE_JPA_DDL_AUTO
```

Recipe and stats are validated as JSON and stored as raw JSON text in the MVP entities. PostgreSQL remains the source of truth; a later migration can move these columns to `jsonb` once database migrations are introduced. Elasticsearch indexing is intentionally not implemented in this phase.

## Commands

```powershell
.\gradlew.bat test
.\gradlew.bat bootRun
```
