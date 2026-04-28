# Codex Prompts

Copy these prompts into Codex in order.

## 0. Confirm context

```txt
현재 로드한 AGENTS.md 지시사항과 사용 가능한 repo skills를 요약해줘. 파일 수정은 하지 마.
```

## 1. Plan Phase 0 only

```txt
$world-forge-planner

현재 저장소를 읽고 AGENTS.md, README.md, docs/, .agents/skills를 기준으로 World Forge 구현 상태를 요약해줘.

그 다음 docs/09_IMPLEMENTATION_ROADMAP.md의 Phase 0을 구현 가능한 작은 작업 단위로 나눠줘.

각 작업마다 다음을 포함해줘:
- 목적
- 생성/수정할 파일
- 완료 기준
- 검증 명령
- 선행 조건
- 다음 작업으로 넘어가기 전 확인할 점

아직 파일 수정은 하지 마. 계획만 제시해줘.
```

## 2. Implement Phase 0 scaffold

```txt
좋아. Phase 0 스캐폴딩만 구현해줘.

범위:
- apps/web React + Vite + TypeScript 앱 생성
- apps/api Spring Boot + Gradle 앱 생성
- packages/shared TypeScript 패키지 생성
- engine/wasm-engine C++/Emscripten 디렉터리 skeleton 생성
- infra/docker-compose.yml에 PostgreSQL, Elasticsearch placeholder 추가
- root README/스크립트/기본 ignore 정리

금지:
- 아직 실제 맵 생성 알고리즘 구현하지 마
- 아직 World Instance 구현하지 마
- 아직 Elasticsearch 검색 구현하지 마
- 아직 인증 구현하지 마
- 아직 3D 구현하지 마

완료 후:
- 생성/수정 파일 목록
- 실행 명령
- 검증 결과
- 다음 단계
를 요약해줘.
```

## 3. Shared contracts

```txt
$world-forge-planner

Phase 1 shared contracts를 구현해줘.

구현할 것:
- GenerationRecipe
- EnabledFeatures
- AlgorithmSelection
- GenerationParams
- MapData
- MapStats
- TerrainType
- ObjectType
- ViewMode
- WorldInstance DTO
- EntityState DTO
- defaultRecipe
- validation helpers
- sample fixtures
- tests

제약:
- 생성 알고리즘 구현하지 마
- 서버 API 구현하지 마
- 렌더러 구현하지 마

완료 기준:
- packages/shared에서 타입과 검증 함수 export 가능
- size/seed/feature/algorithm validation 테스트 통과
- 변경 파일과 검증 명령 요약
```

## 4. WASM engine skeleton

```txt
$world-forge-wasm-engine

Phase 2 WASM engine skeleton을 구현해줘.

목표:
C++/WebAssembly 맵 생성 엔진의 최소 deterministic contract를 만든다.

구현할 것:
- C++17 deterministic PRNG
- minimal heightMap 생성
- terrainMap 분류
- collisionMap 기본 생성
- costMap 기본 생성
- stats 계산
- mapHash 계산
- Emscripten build script
- TypeScript wrapper
- same recipe => same hash 테스트

제약:
- Canvas/React에 의존하지 마
- Spring Boot에 의존하지 마
- 3D 구현하지 마
- Math.random 사용하지 마

완료 후 빌드/테스트 명령과 제한사항을 요약해줘.
```

## 5. Frontend editor MVP

```txt
$world-forge-frontend

Phase 3 /editor MVP를 구현해줘.

필수 UI:
- width/height 선택
- seed 입력과 random seed 버튼
- feature checkbox
- algorithm selector
- parameter sliders
- Generate 버튼
- 2D Terrain View
- Height Map View
- Side View
- stats panel
- mapHash 표시

제약:
- 생성 엔진과 렌더러를 분리해줘
- renderer는 MapData만 입력받아야 함
- 백엔드 저장 기능은 아직 붙이지 마
- 3D는 아직 구현하지 마

완료 후 실행 방법과 검증 결과를 요약해줘.
```

## 6. Spring Boot persistence MVP

```txt
$world-forge-spring-backend

Phase 4 Spring Boot persistence MVP를 구현해줘.

구현할 것:
- health endpoint
- PostgreSQL 연결
- JPA Entity: User 또는 DevUser, MapProject, MapVersion
- Repository/Service/Controller
- Map save/load API
- MapVersion save/list/detail API
- recipe/stats/mapHash validation
- dev user strategy 문서화
- tests

제약:
- 서버에서 맵 생성하지 마
- Elasticsearch 구현하지 마
- 인증 구현하지 마
- World Instance 구현하지 마

완료 후 API 목록과 검증 명령을 요약해줘.
```

## 7. World Instance MVP

```txt
$world-forge-world-instance

Phase 5 World Instance MVP를 구현해줘.

구현할 것:
- WorldInstance, EntityState JPA 모델/API
- frontend /world/:id 기본 화면
- 2D 플레이어 dot 이동
- entity dot wander
- collisionMap 기반 이동 제한
- save/load state

제약:
- 서버에서 simulation tick을 돌리지 마
- 전투 구현하지 마
- 3D 구현하지 마
- 복잡한 리소스 추가하지 마

완료 후 데이터 흐름과 검증 방법을 요약해줘.
```

## 8. Elasticsearch search

```txt
$world-forge-search

Phase 6 Elasticsearch public map search를 구현해줘.

구현할 것:
- docker-compose Elasticsearch 설정
- Spring Boot Elasticsearch client 설정
- world_forge_maps index document
- publish/unpublish indexing flow
- GET /api/search/maps
- GET /api/search/maps/facets
- keyword, features, algorithms, width/height, stats range filters

원칙:
- PostgreSQL이 source of truth
- Elasticsearch는 projection
- private map은 색인하지 않음
- raw Elasticsearch query를 클라이언트에서 받지 않음

완료 후 검색 예시와 검증 명령을 요약해줘.
```

## 9. Review

```txt
$world-forge-reviewer

현재 구현 상태를 리뷰해줘.

중점:
- 맵 생성이 브라우저 WASM에서 수행되는가
- Spring Boot가 실시간 게임 서버처럼 변질되지 않았는가
- PostgreSQL이 source of truth인가
- Elasticsearch가 projection으로만 쓰이는가
- private map indexing이 차단되는가
- 2D/3D/World Instance가 같은 MapData를 공유할 수 있는 구조인가
- generation/rendering/API/persistence 책임이 섞이지 않았는가
- Math.random이 generation에 사용되지 않았는가

파일 수정은 하지 말고 리뷰만 해줘.
```
