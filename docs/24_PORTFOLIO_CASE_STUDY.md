# World Forge 3-Page Portfolio Guide

이 문서는 World Forge를 3페이지 이내 포트폴리오로 정리하기 위한 완성형 자료다.
그대로 복사해도 되고, 발표 자료/노션/이력서 프로젝트 상세 페이지에 맞게 줄여도 된다.

## 사용 원칙

- 기능을 많이 나열하지 말고, `왜 이 구조를 선택했는지`와 `선택의 결과가 무엇인지`를 중심으로 쓴다.
- 수치는 "대표 데모 측정값"으로 사용한다. 실제 제출 전에는 `/compare`, `/determinism`, `npm run verify`로 한 번 재측정하는 것이 좋다.
- 포트폴리오의 핵심 메시지는 다음 한 문장이다.

> World Forge는 C++/WebAssembly 기반 결정론적 월드 생성, 알고리즘 비교, 저장 가능한 월드 인스턴스, public/private 검색 정책을 하나의 사용자 흐름으로 연결한 browser-first procedural world platform입니다.

## 3페이지 구성 요약

| 페이지 | 목적 | 반드시 넣을 것 | 추천 스크린샷 |
| --- | --- | --- | --- |
| 1페이지 | 프로젝트 소개와 아키텍처 | 문제 정의, 목표, 전체 구조, 핵심 기술 스택 | `/portfolio`, `/editor` |
| 2페이지 | 기술적 차별점 | WASM 생성, Algorithm Lab, MapData 중심 설계, 검색 projection | `/compare` 알고리즘 비교 화면 |
| 3페이지 | 결과와 검증 | 실험 수치, 테스트 결과, 배운 점, 다음 개선 방향 | `/determinism`, `/gallery`, `/world/:id` |

---

# Page 1. Project Overview

## 제목

**World Forge - 브라우저에서 생성하고, 저장하고, 탐험하는 절차적 월드 플랫폼**

## 한 줄 소개

World Forge는 사용자가 seed, feature, 알고리즘 조합을 선택해 자신만의 월드를 생성하고, 저장하거나 공개 검색하고, World Instance로 열어 탐험할 수 있는 browser-first procedural world platform이다.

## 문제 정의

일반적인 procedural map demo는 다음 한계가 있다.

- 생성 결과가 일회성이라 저장, 비교, 재현이 어렵다.
- 어떤 알고리즘이 결과에 어떤 영향을 주는지 설명하기 어렵다.
- 서버에서 맵을 생성하면 연산 비용과 확장성 부담이 커진다.
- 2D, 3D, 저장 데이터, 검색 데이터가 서로 다른 구조를 쓰면 기능이 쉽게 깨진다.

World Forge는 이 문제를 `WASM 기반 결정론적 생성`, `MapData 단일 계약`, `PostgreSQL source of truth`, `Elasticsearch projection`, `client-side World Instance simulation`으로 해결했다.

## 핵심 아키텍처

```txt
React / Vite Frontend
 ├─ Editor
 ├─ Algorithm Lab
 ├─ 2D / 3D Renderer
 ├─ Gallery / Explore
 └─ World Instance Simulation

C++ / WebAssembly Engine
 └─ MapData 생성
    ├─ heightMap
    ├─ terrainMap
    ├─ collisionMap
    ├─ costMap
    ├─ portalMap
    ├─ objectList
    ├─ stats
    └─ mapHash

Spring Boot API
 ├─ Auth / Ownership
 ├─ MapProject / MapVersion
 ├─ WorldInstance state save/load
 ├─ Publish / Unpublish
 └─ Search / Reindex API

PostgreSQL
 └─ 원본 데이터 저장

Elasticsearch
 └─ public map 검색 projection
```

## 기술 스택

| 영역 | 기술 | 선택 이유 |
| --- | --- | --- |
| Frontend | React, Vite, TypeScript | 빠른 UI 개발, 타입 안정성, WASM 로딩과 Canvas/3D 렌더링 통합 |
| Map Engine | C++17, Emscripten, WebAssembly | 브라우저에서 무거운 생성 로직 실행, 서버 부하 감소, 결정론적 계산 |
| Rendering | Canvas 2D, Three.js | 2D 디버그/스타일드 맵과 3D terrain preview를 같은 MapData로 표현 |
| Backend | Java 21, Spring Boot, Gradle | 인증, 저장, 검색 API를 안정적으로 구성 |
| Database | PostgreSQL | recipe, mapHash, version, ownership의 source of truth |
| Search | Elasticsearch | public map 검색과 facets를 projection으로 제공 |
| Infra | Docker Compose | local full-stack 실행과 배포 구성을 문서화하기 쉬움 |

## 내가 강조할 역할

- C++/WebAssembly 기반 deterministic map generation 설계 및 연동
- React 기반 Editor, Algorithm Lab, Gallery, Map Detail, My Worlds 구현
- `MapData` 중심의 2D/3D/World Instance 데이터 흐름 정리
- Spring Boot 기반 Auth, Ownership, MapVersion, WorldInstance API 구현
- PostgreSQL source of truth / Elasticsearch projection 구조 설계
- Docker Compose, reindex script, smoke test script로 실행 가능성 확보

---

# Page 2. Technical Highlights

## 1. C++/WebAssembly 브라우저 생성 엔진

World Forge의 맵 생성은 Spring Boot 서버가 아니라 브라우저에서 실행된다.
C++17로 작성한 생성 엔진을 Emscripten으로 WebAssembly artifact로 빌드하고, React 앱이 해당 artifact를 로드해 `MapData`를 생성한다.

### 기대한 효과

- 서버가 맵 생성 연산을 부담하지 않는다.
- 같은 seed + recipe에서 같은 `mapHash`를 얻을 수 있다.
- 생성 엔진은 React, Canvas, Spring Boot를 모르는 순수 데이터 엔진으로 유지된다.

### 기존 방식 대비 장점

| 비교 | 기존 TS mock 중심 생성 | 현재 WASM 중심 생성 |
| --- | --- | --- |
| 역할 분리 | UI 코드와 생성 로직이 섞이기 쉬움 | 엔진은 MapData만 출력 |
| 성능 책임 | 브라우저 JS에 직접 의존 | C++ 엔진을 WASM으로 실행 |
| 재현성 | fallback 성격 | seed + recipe + mapHash 계약 |
| 포트폴리오 설명력 | 단순 데모처럼 보임 | 엔진/렌더러/API 경계가 명확함 |

## 2. Algorithm Lab

Algorithm Lab은 같은 seed와 같은 크기를 기준으로 좌우 설계를 비교하는 화면이다.
각 설계에서 다음 알고리즘을 독립적으로 선택할 수 있다.

| 분류 | 알고리즘 |
| --- | --- |
| 지형 | Noise Island, Radial Island |
| 동굴 | Cellular Automata, Random Walk |
| 도로 | Simple Path, A* |
| 오브젝트 배치 | Biome Density, Scatter |

## Algorithm Lab에서 보여줄 핵심

- 알고리즘 label만 바뀌는 것이 아니라 실제 `MapData`가 달라진다.
- `mapHash`가 달라져 저장 가능한 버전 차이로 남는다.
- 차이 히트맵으로 좌우 결과의 변경 지점을 시각화한다.
- 생성 시간, 차이 타일 비율, 동굴 타일, 도로 길이, 오브젝트 수를 함께 보여준다.

## 대표 실험 수치

아래 수치는 local demo 기준 예시다. 제출 전 같은 seed로 다시 측정하면 더 좋다.

### 실험 A - 전체 알고리즘 조합 비교

조건:

```txt
Seed: 동일 seed
Size: 128~512 중 데모용 크기
Left:
  Terrain: Noise Island
  Cave: Cellular Automata
  Road: Simple Path
  Object: Biome Density
Right:
  Terrain: Radial Island
  Cave: Random Walk
  Road: A*
  Object: Scatter
```

대표 결과:

| 항목 | Left | Right | 해석 |
| --- | ---: | ---: | --- |
| 생성 시간 | 86ms | 44ms | 조합에 따라 브라우저 WASM 생성 비용 차이 발생 |
| 차이 타일 | 89% | 89% | 전체 지형/이동/높이 차이가 넓게 발생 |
| 동굴 타일 | 3,413 | 923 | Cellular Automata는 방/군집형, Random Walk는 터널형 |
| 도로 길이 | 578 | 1,370 | A*가 더 긴 연결망을 만들 수 있음 |
| 나무/바위/마을 | 207/0/1 | 85/0/1 | Scatter는 조건을 덜 타고 더 퍼지는 경향 |
| 물 비율 | 16% | 42% | Radial Island 조합에서 수역이 넓게 형성 |
| 숲 비율 | 33% | 22% | terrain + object placement 조합에 따라 분포 변화 |

### 실험 B - 동굴 알고리즘 단독 비교

조건:

```txt
Size: 512 x 512
Cave Density: high
Cellular Automata vs Random Walk
```

대표 결과:

| 알고리즘 | 동굴 타일 | 특징 |
| --- | ---: | --- |
| Cellular Automata | 약 51,637 | 넓은 방과 덩어리형 동굴 군집 |
| Random Walk | 약 2,879 | 길고 구불구불한 터널망 |

설명 문장:

> Cellular Automata는 인접 셀 smoothing으로 방처럼 이어지는 동굴권을 만들고, Random Walk는 여러 walker가 이동하며 터널 footprint를 남기도록 구현했습니다. 그래서 같은 cave feature라도 "방 중심 던전"과 "통로 중심 던전"의 차이를 시각적으로 비교할 수 있습니다.

### 실험 C - 오브젝트 배치 밀도

조건:

```txt
Size: 512 x 512
Object Placement: Scatter
Forest Density / Object Density 변경
```

대표 결과:

| Object Density | Tree Count | 분포 |
| ---: | ---: | --- |
| 0.2 | 약 288 | y축 23~505 범위까지 분산 |
| 0.9 | 약 1,296 | y축 4~508 범위까지 분산 |

개선 포인트:

초기에는 오브젝트 후보를 위쪽 행부터 순회해 target count가 차면 종료했기 때문에, 512x512에서 나무가 상단에 몰리는 문제가 있었다.
이를 전체 후보 ranking + spacing 방식으로 바꿔서 밀도를 낮추면 수가 줄고, 높은 밀도에서도 전체 맵에 분산되도록 수정했다.

## 3. MapData 중심 설계

생성 엔진은 화면을 그리지 않고 `MapData`만 출력한다.

```ts
MapData {
  width
  height
  heightMap
  terrainMap
  collisionMap
  costMap
  portalList
  objectList
  stats
  mapHash
}
```

이 구조 덕분에 다음 기능이 같은 데이터를 공유한다.

- 2D terrain view
- height map view
- side view
- 3D terrain preview
- World Instance movement
- map save/load
- public search indexing
- algorithm comparison

설명 문장:

> 렌더러가 생성 알고리즘을 직접 알지 못하게 하고, 모든 뷰가 MapData만 소비하도록 만들었습니다. 덕분에 2D와 3D가 같은 월드를 보여주고, World Instance 이동 규칙도 같은 collisionMap과 costMap을 사용할 수 있습니다.

## 4. PostgreSQL source of truth / Elasticsearch projection

Spring Boot는 맵을 생성하지 않는다.
대신 사용자, 맵 프로젝트, 맵 버전, 공개 상태, World Instance snapshot, 검색 indexing을 담당한다.

중요한 설계 원칙:

- PostgreSQL이 source of truth다.
- Elasticsearch는 public map 검색 projection이다.
- private map은 색인하지 않는다.
- 프론트엔드는 raw Elasticsearch query를 보내지 않는다.
- reindex는 Spring Boot admin API를 통해 실행한다.

설명 문장:

> 검색 성능을 위해 Elasticsearch를 사용했지만, 원본 데이터는 PostgreSQL에 두었습니다. Elasticsearch 문서가 누락되거나 오래될 수 있다는 전제를 두고, public map만 다시 색인하는 reindex 경로를 별도로 만들었습니다.

---

# Page 3. Result, Validation, and Learning

## 구현된 사용자 흐름

현재 World Forge는 다음 흐름을 지원한다.

1. 회원가입
2. 로그인
3. Editor에서 WASM으로 맵 생성
4. seed, size, feature, algorithm 변경
5. mapHash와 stats 확인
6. 맵 저장
7. My Worlds에서 내 맵 확인
8. Map Detail에서 정보 확인
9. World Instance 생성
10. player/entity 이동
11. collisionMap, costMap, portalMap 기반 이동 제한
12. state 저장/복원
13. public map publish
14. Gallery/Explore 검색
15. Elasticsearch reindex 후 public 검색 유지

## 검증 결과

대표 검증 명령:

```powershell
npm run verify
```

현재 verify에 포함되는 검증:

| 영역 | 검증 |
| --- | --- |
| shared contracts | build/test |
| WASM wrapper | build/test |
| frontend | build/test |
| Spring Boot API | Gradle test |
| Docker infra | compose config |

대표 테스트 수:

| 영역 | 테스트 |
| --- | ---: |
| shared package | 6 |
| WASM wrapper | 13 |
| frontend | 62 |
| API | Gradle test 통과 |

배포/운영 검증:

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example up -d --build

.\scripts\reindex-search.ps1 `
  -ApiBaseUrl "http://localhost:8080" `
  -AdminToken "local-admin-token-change-me"

.\scripts\smoke-test-api.ps1 `
  -ApiBaseUrl "http://localhost:8080" `
  -AdminToken "local-admin-token-change-me" `
  -Prefix "WF-SMOKE"
```

## 성과 정리

| 목표 | 결과 |
| --- | --- |
| 브라우저 생성 | C++/WASM artifact를 React에서 로드해 MapData 생성 |
| 결정론 | 같은 seed + recipe에서 같은 mapHash 유지 |
| 알고리즘 비교 | 지형/동굴/도로/오브젝트 알고리즘 좌우 비교 가능 |
| 저장 | MapProject / MapVersion 저장 |
| 검색 | public map만 Elasticsearch projection으로 검색 |
| 보안 | private map 검색 미노출, owner 검증 |
| 월드 탐험 | World Instance state 저장/복원, client-side movement |
| 배포 | local/prod compose, API/Web Dockerfile, smoke/reindex script |

## 배운 점

### 1. WASM은 성능만이 아니라 경계 설계에도 도움이 됐다

처음에는 성능을 기대하고 WASM을 선택했지만, 실제로 더 큰 장점은 `생성 엔진의 책임을 분리할 수 있다는 점`이었다.
엔진은 React도, Canvas도, Spring Boot도 모르고 `MapData`만 출력한다.
이 덕분에 렌더링, 저장, 검색, World Instance가 같은 데이터를 기준으로 발전할 수 있었다.

### 2. 검색은 source of truth가 아니라 projection으로 두는 편이 안전했다

Elasticsearch에 모든 것을 맡기면 private map 노출이나 색인 누락 문제가 커질 수 있다.
그래서 PostgreSQL을 원본으로 두고, public map만 projection으로 색인했다.
reindex API를 둔 것도 이 선택의 연장선이다.

### 3. 포트폴리오용 기능은 "설명 가능성"이 중요했다

Algorithm Lab을 만들면서 단순히 알고리즘 선택 UI만으로는 부족하다는 것을 확인했다.
그래서 road tile, cave footprint, objectList, 차이 히트맵, 생성 시간, 차이 타일 비율을 함께 보여주도록 개선했다.
이제 면접에서 "알고리즘이 실제로 어떤 차이를 만들었는지"를 화면과 수치로 설명할 수 있다.

## 면접에서 말하기 좋은 문장

- "Spring Boot가 맵을 생성하지 않도록 제한하고, 생성은 브라우저 WASM에서 수행하도록 경계를 나눴습니다."
- "PostgreSQL은 source of truth이고 Elasticsearch는 public map 검색 projection으로만 사용했습니다."
- "같은 seed와 recipe에서 같은 mapHash가 나오도록 deterministic contract를 만들었습니다."
- "렌더러는 생성 알고리즘을 모르고 MapData만 소비합니다."
- "Algorithm Lab은 알고리즘 선택이 실제 terrainMap, cave footprint, road tile, objectList에 어떤 차이를 만드는지 보여주기 위해 만든 포트폴리오용 실험 화면입니다."

## 이력서용 3줄 요약

- C++/WebAssembly 기반 deterministic procedural map engine을 구현하고 React/Vite 앱에서 WASM artifact를 로드해 브라우저에서 MapData를 생성하도록 설계.
- Spring Boot, PostgreSQL, Elasticsearch를 활용해 map version 저장, ownership, public/private 검색 projection, reindex flow를 구현.
- Algorithm Lab, 2D/3D renderer, World Instance simulation을 같은 MapData 계약 위에 구성해 생성/렌더링/저장/검색 책임을 분리.

## 포트폴리오 이미지 구성 추천

1. 첫 이미지: `/portfolio` 또는 `/editor`
   - 프로젝트 전체 인상을 보여준다.

2. 두 번째 이미지: `/compare`
   - 좌우 알고리즘 비교, 생성 시간, 차이 타일, 동굴/도로/오브젝트 수치를 보여준다.

3. 세 번째 이미지: `/determinism`
   - 같은 seed + recipe에서 같은 mapHash가 나오는 결정론 검증을 보여준다.

4. 네 번째 이미지: `/gallery`
   - public map search, filter, facets를 보여준다.

5. 선택 이미지: `/world/:id`
   - 생성된 맵이 저장 후 탐험 가능한 월드로 이어지는 흐름을 보여준다.

## 3페이지에 넣을 최종 문장 샘플

### Page 1 하단

> 이 프로젝트에서 가장 중요한 설계 원칙은 "생성은 브라우저 WASM, 저장과 검색은 서버"로 역할을 분리하는 것이었습니다. 서버가 실시간 게임 서버나 맵 생성 엔진으로 비대해지지 않도록 제한했고, 모든 뷰와 저장 흐름은 MapData 계약을 기준으로 연결했습니다.

### Page 2 하단

> Algorithm Lab은 포트폴리오에서 기술적 차이를 보여주기 위해 만든 실험 화면입니다. 같은 seed에서 지형, 동굴, 도로, 오브젝트 배치 알고리즘만 바꿔 생성하고, 차이 히트맵과 stats를 통해 알고리즘의 영향을 수치화했습니다.

### Page 3 하단

> World Forge는 단순한 랜덤 맵 생성 데모가 아니라, 결정론적 생성, 버전 저장, 공개 검색, 월드 인스턴스 탐험까지 이어지는 end-to-end 흐름을 구현한 프로젝트입니다. 특히 WASM, Spring Boot, PostgreSQL, Elasticsearch를 각각 필요한 책임에만 사용하도록 경계를 나눈 점이 핵심입니다.

## 제출 전 체크리스트

- `/compare`에서 알고리즘 비교 스크린샷 최신화
- `/determinism`에서 mapHash 동일성 검증 캡처
- `npm run verify` 결과 확인
- local full-stack 실행 확인
- private map이 검색에 나오지 않는 흐름 확인
- 포트폴리오 수치가 최신 화면과 크게 다르지 않은지 확인
