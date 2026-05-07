# World Forge

### 브라우저에서 생성하고, 저장하고, 탐험하는 절차적 월드 플랫폼

*C++/WebAssembly 기반 결정론적 맵 생성, 알고리즘 비교, 저장 가능한 월드 인스턴스, 공개 맵 검색까지 하나의 사용자 흐름으로 연결한 browser-first procedural world platform*

<img width="2198" height="1286" alt="image (14)" src="https://github.com/user-attachments/assets/8eae5310-61b5-423e-924b-ed83f022b52a" />

---

## 목차

- [프로젝트 소개](#프로젝트-소개)
- [핵심 가치](#핵심-가치)
- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [아키텍처](#아키텍처)
- [알고리즘 비교실](#알고리즘-비교실)
- [데이터 흐름](#데이터-흐름)
- [프로젝트 구조](#프로젝트-구조)
- [포트폴리오 요약](#포트폴리오-요약)

---

## 프로젝트 소개

### World Forge란?

World Forge는 사용자가 seed, feature, 알고리즘 조합을 선택해 자신만의 절차적 월드를 만들고, 저장하거나 공개 검색하고, World Instance로 열어 탐험할 수 있는 웹 기반 월드 제작 플랫폼입니다.

일반적인 procedural map demo는 한 번 생성하고 끝나는 경우가 많습니다. World Forge는 여기서 한 단계 더 나아가 다음 흐름을 하나의 제품 경험으로 연결했습니다.

```txt
알고리즘 선택
  -> 브라우저 WASM 맵 생성
  -> mapHash / stats 확인
  -> MapVersion 저장
  -> World Instance 생성
  -> 2D/3D 탐험
  -> public publish
  -> Gallery 검색 / reindex
```

### 해결하려 한 문제

- 생성 결과가 일회성이라 저장, 비교, 재현이 어렵다.
- 어떤 알고리즘이 결과에 어떤 영향을 주는지 설명하기 어렵다.
- 서버가 맵 생성까지 담당하면 연산 비용과 책임 범위가 커진다.
- 2D, 3D, 저장 데이터, 검색 데이터가 서로 다른 구조를 쓰면 기능이 쉽게 깨진다.
- private map이 검색에 노출되지 않도록 source of truth와 search projection 경계를 명확히 해야 한다.

World Forge는 이 문제를 `C++/WebAssembly`, `MapData 단일 계약`, `PostgreSQL source of truth`, `Elasticsearch projection`, `client-side World Instance simulation`으로 해결했습니다.

---

## 핵심 가치

### 1. Browser-first generation

맵 생성은 Spring Boot 서버가 아니라 브라우저에서 실행됩니다. C++17로 작성한 생성 엔진을 Emscripten으로 WebAssembly artifact로 빌드하고, React 앱이 해당 artifact를 로드해 `MapData`를 생성합니다.

기대한 효과:

- 서버가 무거운 맵 생성 연산을 부담하지 않는다.
- 사용자는 브라우저에서 빠르게 seed와 알고리즘을 바꿔볼 수 있다.
- 생성 엔진은 React, Canvas, Spring Boot를 모르는 순수 데이터 엔진으로 유지된다.

### 2. Deterministic world contract

같은 recipe와 같은 seed는 같은 `mapHash`를 만들어야 합니다. 이 계약 덕분에 월드 생성 결과를 저장, 비교, 재현할 수 있습니다.

```txt
GenerationRecipe + seed
  -> C++/WASM generation
  -> MapData
  -> mapHash
```

### 3. Data boundary first

엔진은 화면을 그리지 않고 `MapData`만 출력합니다. 렌더러, 저장 API, 검색 projection, World Instance는 모두 같은 데이터를 소비합니다.

```txt
MapData
  ├─ heightMap
  ├─ terrainMap
  ├─ collisionMap
  ├─ costMap
  ├─ portalMap
  ├─ objectList
  ├─ stats
  └─ mapHash
```

### 4. PostgreSQL source of truth

PostgreSQL은 원본 데이터 저장소입니다. Elasticsearch는 public map 검색을 위한 projection입니다.

- recipe, stats, mapHash, version, owner, world state는 PostgreSQL에 저장
- public map만 Elasticsearch에 색인
- private map은 검색에 노출되지 않음
- reindex는 raw Elasticsearch API가 아니라 Spring Boot admin API를 통해 실행

---

## 주요 기능

### 1. Editor

<img width="1200" height="675" alt="Video Project 1 (2)" src="https://github.com/user-attachments/assets/35cddea0-07f9-4e3a-b242-104132bf1fe4" />

- width / height 선택
- seed 입력과 random seed
- feature checkbox
- 지형, 동굴, 도로, 오브젝트 배치 알고리즘 선택
- water, forest, mountain, cave, road, object density 조절
- WASM 기반 map generation
- `mapHash`, stats, engine version 표시
- 2D terrain view, height map view, side view, 3D terrain preview
- map save / version load

### 2. Algorithm Comparison Lab

<img width="1000" height="563" alt="Video Project 1 (1) (1)" src="https://github.com/user-attachments/assets/a0b2ed91-6b53-4960-9519-8436d41b2443" />

- 같은 seed를 기준으로 좌우 설계 비교
- 지형, 동굴, 도로, 오브젝트 배치 알고리즘을 각각 독립 선택
- cave, road, object overlay와 차이 타일 비율 표시
- 생성 시간, 동굴 타일, 도로 길이, 오브젝트 수 등 결과 수치화

### 3. Determinism Lab

<img width="1000" height="378" alt="2026-05-07 15 03 38" src="https://github.com/user-attachments/assets/c1035d83-9476-4ed2-9af8-71ec3442ca67" />

- 같은 recipe + seed에서 같은 `mapHash`가 나오는지 검증
- seed만 변경했을 때 결과가 달라지는지 확인
- 맵 크기별 생성 시간 비교

### 4. World Instance

<img width="1000" height="563" alt="Video Project 1 (2) (1)" src="https://github.com/user-attachments/assets/7dabf231-3d9b-4301-95c8-75fcd53b9f39" />


- 저장된 MapData를 기반으로 월드 인스턴스 생성
- player / creature 위치 저장
- collisionMap, costMap, portalMap 기반 이동
- surface / cave layer 전환
- client-side living world simulation
- toy combat, defeated, respawn 상태 저장
- 서버는 simulation tick을 돌리지 않고 state snapshot만 저장

### 5. Gallery / Explore
<img width="1200" height="675" alt="Video Project 1 (3)" src="https://github.com/user-attachments/assets/3421becc-96cc-40ed-b289-1adc794cf437" />

- public map 검색
- keyword, feature, algorithm, stats, livingStats 필터
- facets 표시
- private map 검색 미노출
- Elasticsearch reindex로 PostgreSQL public map 기준 projection 재구성

---

## 기술 스택

| 영역 | 기술 | 선택 이유 |
| --- | --- | --- |
| Frontend | React, Vite, TypeScript | 빠른 UI 개발, 타입 안정성, WASM 로딩과 Canvas/3D 렌더링 통합 |
| Map Engine | C++17, Emscripten, WebAssembly | 브라우저에서 무거운 생성 로직 실행, 결정론적 계산, 서버 비용 감소 |
| Rendering | Canvas 2D, Three.js | 2D debug/styled map과 3D terrain preview를 같은 MapData로 표현 |
| Backend | Java 21, Spring Boot, Gradle | 인증, 저장, 검색, reindex API를 안정적으로 구성 |
| Persistence | PostgreSQL | recipe, mapHash, ownership, version, world state의 source of truth |
| Search | Elasticsearch | public map 검색, facets, livingStats projection |
| Infra | Docker Compose, Nginx | local/prod 실행 구성, SPA fallback, WASM 정적 배포 |
| Test/Ops | Vitest, JUnit, smoke scripts | shared/WASM/frontend/API 검증과 배포 후 핵심 흐름 확인 |

---

## 아키텍처

<img width="1448" height="1086" alt="ChatGPT Image 2026년 5월 2일 오후 10_48_12" src="https://github.com/user-attachments/assets/bdc57cd9-a618-4058-987b-9f332c699f9e" />


### 책임 분리

| 모듈 | 책임 | 하지 않는 일 |
| --- | --- | --- |
| WASM Engine | deterministic MapData 생성 | Canvas/WebGL 렌더링, DB 저장 |
| React Frontend | UI, WASM 로딩, 렌더링, client simulation | raw Elasticsearch 호출 |
| Spring Boot API | auth, ownership, map/version/world state 저장, search API | primary map generation, real-time simulation |
| PostgreSQL | 원본 데이터 저장 | 검색 projection 전용 인덱스 역할 |
| Elasticsearch | public map 검색 projection | private map 저장, source of truth 역할 |

---

## 알고리즘 비교실

Algorithm Lab은 같은 seed와 parameter 조건에서 알고리즘만 바꿔 결과 차이를 비교하는 실험 화면입니다. 지형, 동굴, 도로, 오브젝트 배치 알고리즘을 각각 독립적으로 바꿀 수 있고, 결과는 `MapData`, `mapHash`, stats, overlay로 바로 확인할 수 있습니다.

### 비교 가능한 알고리즘

| 분류 | 알고리즘 | 화면에서 기대할 차이 |
| --- | --- | --- |
| 지형 | Noise Island | 불규칙한 노이즈 섬 윤곽 |
| 지형 | Radial Island | 중심에서 바깥으로 낮아지는 방사형 섬 |
| 동굴 | Cellular Automata | smoothing으로 연결된 방/군집형 동굴권 |
| 동굴 | Random Walk | walker가 지나간 흔적 기반의 터널형 동굴 |
| 도로 | Simple Path | 중심 축을 관통하는 단순 연결로 |
| 도로 | A* | 비용이 높은 지형을 피해 거점을 잇는 연결망 |
| 오브젝트 | Biome Density | 바이옴 조건을 만족하는 곳에 오브젝트 집중 |
| 오브젝트 | Scatter | 조건을 덜 타고 맵 전체로 산포 |

### 알고리즘별 결과 비교

#### 1. 지형 알고리즘 비교

동일 조건에서 `Noise Island`와 `Radial Island`는 섬의 윤곽과 고도 분포를 다르게 만듭니다.

| Noise Island | Radial Island |
| --- | --- |
| <img width="1308" height="1324" alt="Noise Island 지형 알고리즘 결과" src="https://github.com/user-attachments/assets/51a891f6-ccee-4ab9-a505-b73b9044663e" /> | <img width="1346" height="1322" alt="Radial Island 지형 알고리즘 결과" src="https://github.com/user-attachments/assets/6963093c-9850-4491-bf50-a725d8e7750b" /> |

비교 포인트:

- `Noise Island`: 노이즈 기반이라 해안선과 섬 윤곽이 불규칙하게 흔들린다.
- `Radial Island`: 중심에서 바깥으로 낮아지는 구조라 둥근 섬, 해안 링, 중심부가 더 명확하게 보인다.

#### 2. 동굴 알고리즘 비교

동일 조건에서 `Cellular Automata`와 `Random Walk`는 동굴의 형태를 방 중심 구조와 터널 중심 구조로 다르게 만듭니다.

| Cellular Automata | Random Walk |
| --- | --- |
| <img width="1334" height="1312" alt="Cellular Automata 동굴 알고리즘 결과" src="https://github.com/user-attachments/assets/cd8af4b3-3126-4402-aefc-1eeb4433898e" /> | <img width="1332" height="1306" alt="Random Walk 동굴 알고리즘 결과" src="https://github.com/user-attachments/assets/16a49fa2-ff5f-49be-82db-37cd76dcd66a" /> |

비교 포인트:

- `Cellular Automata`: 인접 셀 smoothing으로 넓은 방과 덩어리형 동굴권이 만들어진다.
- `Random Walk`: walker가 이동하며 흔적을 남기므로 길고 구불구불한 터널망에 가깝다.

#### 3. 도로 알고리즘 비교

동일 조건에서 `Simple Path`와 `A*`는 연결 경로를 만드는 방식이 다릅니다. 도로는 노란색 overlay로 표시됩니다.

| Simple Path | A* |
| --- | --- |
| <img width="1334" height="1316" alt="Simple Path 도로 알고리즘 결과" src="https://github.com/user-attachments/assets/ea965b8d-284c-46a3-bd37-965459b6f63b" /> | <img width="1330" height="1302" alt="A* 도로 알고리즘 결과" src="https://github.com/user-attachments/assets/fb206e19-c538-4200-a908-e961555b6fda" /> |

비교 포인트:

- `Simple Path`: 중심부 또는 주요 축을 관통하는 단순 연결로를 만든다.
- `A*`: collision/cost를 고려해 막힌 지형과 높은 비용 지형을 피해 연결망을 만든다.

#### 4. 오브젝트 배치 알고리즘 비교

동일 조건에서 `Biome Density`와 `Scatter`는 나무, 바위, 마을 같은 오브젝트를 배치하는 기준이 다릅니다.

| Biome Density | Scatter |
| --- | --- |
| <img width="1328" height="1318" alt="Biome Density 오브젝트 배치 결과" src="https://github.com/user-attachments/assets/337a60bb-311d-4837-8515-bda4c389054f" /> | <img width="1352" height="1324" alt="Scatter 오브젝트 배치 결과" src="https://github.com/user-attachments/assets/f432beb0-3179-4637-9a20-9da500d69d0e" /> |

비교 포인트:

- `Biome Density`: forest/grass 등 조건이 맞는 바이옴에 오브젝트가 더 모인다.
- `Scatter`: 조건을 덜 타고 넓은 영역에 오브젝트가 분산된다.

### 대표 비교 수치

동일한 비교 화면에서 생성 시간, 지형 차이, 동굴/도로/오브젝트 결과를 함께 수치화했습니다.

| 항목 | Left | Right | 해석 |
| --- | ---: | ---: | --- |
| 생성 시간 | 86ms | 44ms | 알고리즘 조합에 따라 WASM 생성 비용 차이 발생 |
| 차이 타일 | 89% | 89% | 좌우 설계가 전체 맵 구조에 크게 다른 영향을 줌 |
| 동굴 타일 | 3,413 | 923 | Cellular Automata는 넓은 방, Random Walk는 좁은 터널에 가까움 |
| 도로 길이 | 578 | 1,370 | A*는 지형 비용을 피해 더 긴 연결로를 만들 수 있음 |
| 나무/바위/마을 | 207/0/1 | 85/0/1 | 배치 알고리즘에 따라 objectList 분포가 달라짐 |
| 물 비율 | 16% | 42% | terrain algorithm 조합에 따라 섬 성격 변화 |
| 숲 비율 | 33% | 22% | 지형과 오브젝트 배치 조건이 함께 영향을 줌 |

<img width="2702" height="492" alt="image" src="https://github.com/user-attachments/assets/18dc3b9a-e0eb-4485-916f-80e2648589a0" />

### 개선 사례

초기에는 512x512 맵에서 오브젝트가 상단에 몰리는 문제가 있었습니다. 원인은 후보 타일을 위쪽 행부터 순회하고 target count가 차면 종료하는 방식이었습니다.

수정 방향:

- 전체 후보를 deterministic ranking으로 평가
- entity/object 간 최소 거리 적용
- density가 낮으면 수가 줄고, 높으면 전체 맵에 퍼지도록 spacing 조정
- `Math.random()` 없이 seed 기반 로직 유지

대표 결과:

| 조건 | Tree Count | 분포 |
| --- | ---: | --- |
| object density 0.2 | 약 288 | y축 23~505 범위까지 분산 |
| object density 0.9 | 약 1,296 | y축 4~508 범위까지 분산 |

---

## 데이터 흐름

### Map save

```txt
Browser WASM
  -> MapData
  -> React Editor
  -> POST /api/maps
  -> PostgreSQL MapProject / MapVersion
```

### World Instance

```txt
MapVersion
  -> World Instance 생성
  -> Browser client-side movement
  -> state snapshot
  -> Spring Boot save/load
  -> PostgreSQL WorldInstance / EntityState
```

### Public search

```txt
PostgreSQL public maps
  -> Spring Boot indexing service
  -> Elasticsearch world_forge_maps projection
  -> GET /api/search/maps
  -> Gallery / Explore
```

## 프로젝트 구조

```txt
apps/
  web/                  React + Vite frontend
  api/                  Spring Boot API

engine/
  wasm-engine/          C++17 / Emscripten map engine
    src/engine.cpp
    ts/                 TypeScript wrapper and tests

packages/
  shared/               shared contracts and validation helpers

infra/
  docker-compose.yml
  docker-compose.local.yml
  docker-compose.prod.yml

scripts/
  reindex-search.ps1
  reindex-search.sh
  smoke-test-api.ps1
  smoke-test-api.sh

docs/
  23_DEPLOYMENT_GUIDE.md
  24_PORTFOLIO_CASE_STUDY.md
```

---

## 포트폴리오 요약

### 한 줄 소개

World Forge는 C++/WebAssembly 기반 결정론적 월드 생성, 알고리즘 비교, 저장 가능한 월드 인스턴스, public/private 검색 정책을 하나의 사용자 흐름으로 연결한 browser-first procedural world platform입니다.

### 핵심 기여

- C++/WebAssembly deterministic map engine 설계 및 React 연동
- `MapData` 중심의 2D/3D/rendering/save/search 데이터 계약 구성
- Algorithm Lab으로 알고리즘별 결과 차이를 수치와 화면으로 비교
- Spring Boot, PostgreSQL, Elasticsearch 기반 map/version/search/publish 흐름 구현
- private map 검색 미노출, public map reindex, smoke test 등 배포 검증 흐름 구성

### 기술적 성과

- Spring Boot가 맵을 생성하지 않도록 제한하고, 생성은 브라우저 WASM에서 수행하도록 경계를 분리했습니다.
- PostgreSQL을 source of truth로 두고 Elasticsearch는 public map 검색 projection으로만 사용했습니다.
- 같은 seed와 recipe에서 같은 `mapHash`가 나오도록 deterministic contract를 만들었습니다.
- 렌더러는 생성 알고리즘을 모르고 `MapData`만 소비하도록 구성했습니다.
- Algorithm Lab에서 terrainMap, cave footprint, road tile, objectList 차이를 화면과 수치로 비교할 수 있게 만들었습니다.

### 프로젝트 정리

- C++/WebAssembly 기반 deterministic procedural map engine을 구현하고 React/Vite 앱에서 WASM artifact를 로드해 브라우저에서 `MapData`를 생성하도록 설계.
- Spring Boot, PostgreSQL, Elasticsearch를 활용해 map version 저장, ownership, public/private 검색 projection, reindex flow를 구현.
- Algorithm Lab, 2D/3D renderer, World Instance simulation을 같은 `MapData` 계약 위에 구성해 생성/렌더링/저장/검색 책임을 분리.

---

## 참고 문서

- [`docs/24_PORTFOLIO_CASE_STUDY.md`](docs/24_PORTFOLIO_CASE_STUDY.md): 3페이지 포트폴리오 작성 자료
- [`docs/23_DEPLOYMENT_GUIDE.md`](docs/23_DEPLOYMENT_GUIDE.md): 배포 준비 문서
- [`docs/22_E2E_VALIDATION_CHECKLIST.md`](docs/22_E2E_VALIDATION_CHECKLIST.md): E2E 수동 검증 체크리스트
- [`docs/04_GENERATION_ENGINE_SPEC.md`](docs/04_GENERATION_ENGINE_SPEC.md): 생성 엔진 명세
- [`docs/18_ELASTICSEARCH_SEARCH_SPEC.md`](docs/18_ELASTICSEARCH_SEARCH_SPEC.md): 검색 projection 명세

---

**World Forge** - deterministic procedural worlds, generated in the browser and persisted as explorable worlds.
