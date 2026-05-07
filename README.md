# World Forge

### 브라우저에서 생성하고, 저장하고, 탐험하는 절차적 월드 플랫폼

*C++/WebAssembly 기반 결정론적 맵 생성, 알고리즘 비교, 저장 가능한 월드 인스턴스, 공개 맵 검색까지 하나의 사용자 흐름으로 연결한 browser-first procedural world platform*

> 대표 이미지 / 메인 GIF 첨부 위치  
> 아래 줄에 GitHub issue/comment/README 편집창에 업로드한 이미지 또는 움짤 URL을 붙여 넣으면 됩니다.
>
> <!-- 예시: <img width="2856" height="1504" alt="World Forge 메인 시연" src="https://github.com/user-attachments/assets/..." /> -->
> <!-- 추천: /portfolio 또는 /editor에서 월드가 생성된 장면, 16:9 비율 -->

---

## 목차

- [프로젝트 소개](#프로젝트-소개)
- [시연 이미지 구성](#시연-이미지-구성)
- [핵심 가치](#핵심-가치)
- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [아키텍처](#아키텍처)
- [알고리즘 비교실](#알고리즘-비교실)
- [데이터 흐름](#데이터-흐름)
- [검증과 실험 결과](#검증과-실험-결과)
- [로컬 실행](#로컬-실행)
- [배포와 운영](#배포와-운영)
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

## 시연 이미지 구성

포트폴리오 README에서는 모든 화면을 다 보여주기보다, 아래 6장만 넣어도 프로젝트의 핵심이 충분히 전달됩니다.

첨부 방법:

1. GitHub에서 README 편집 화면을 연다.
2. 원하는 이미지 또는 GIF를 해당 placeholder 위치에 드래그 앤 드롭한다.
3. GitHub가 생성한 `<img ... src="https://github.com/user-attachments/assets/...">` 또는 `![...](...)` 문법으로 placeholder 문구를 교체한다.

### 1. 메인 데모

> 첨부 위치: `/portfolio` 또는 `/editor` 전체 화면  
> 보여줄 것: World Forge가 "월드 생성 플랫폼"이라는 첫인상
>
> <!-- <img width="2856" height="1504" alt="World Forge 메인 데모" src="https://github.com/user-attachments/assets/..." /> -->

### 2. 알고리즘 비교실

> 첨부 위치: `/compare` 좌우 비교 화면  
> 보여줄 것: 같은 seed에서 알고리즘 선택에 따라 결과가 달라지는 장면
>
> <!-- <img width="2856" height="1504" alt="Algorithm Comparison Lab" src="https://github.com/user-attachments/assets/..." /> -->

### 3. 결정론 검증

> 첨부 위치: `/determinism` 화면  
> 보여줄 것: 같은 seed + recipe에서 같은 `mapHash`가 나오는 장면
>
> <!-- <img width="2856" height="1504" alt="Determinism Lab" src="https://github.com/user-attachments/assets/..." /> -->

### 4. 2D / 3D 월드 뷰

> 첨부 위치: `/world/:id`의 Styled 2D 또는 3D view  
> 보여줄 것: 생성된 맵이 탐험 가능한 월드 인스턴스로 이어지는 장면
>
> <!-- <img width="2856" height="1504" alt="World Instance 2D 3D view" src="https://github.com/user-attachments/assets/..." /> -->

### 5. Gallery / Explore

> 첨부 위치: `/gallery` 검색 결과 화면  
> 보여줄 것: public map 검색, filter, facets
>
> <!-- <img width="2856" height="1504" alt="Gallery public map search" src="https://github.com/user-attachments/assets/..." /> -->

### 6. 배포 / 검증 결과

> 첨부 위치: terminal 캡처 또는 GitHub Actions 캡처  
> 보여줄 것: `npm run verify`, smoke test, CI 통과
>
> <!-- <img width="2856" height="1504" alt="World Forge verification result" src="https://github.com/user-attachments/assets/..." /> -->

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

> 이미지 / 움짤 첨부 위치: Editor에서 seed, feature, algorithm을 바꿔 맵을 생성하는 장면  
> <!-- <img width="2856" height="1504" alt="Editor WASM map generation" src="https://github.com/user-attachments/assets/..." /> -->

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

> 이미지 / 움짤 첨부 위치: 좌우 알고리즘 비교 후 차이 히트맵을 확인하는 장면  
> <!-- <img width="2856" height="1504" alt="Algorithm Lab side by side comparison" src="https://github.com/user-attachments/assets/..." /> -->

같은 seed를 기준으로 좌우 설계를 비교합니다.

- 왼쪽/오른쪽 각각 지형, 동굴, 도로, 오브젝트 배치 알고리즘 선택
- feature와 density parameter 조절
- cave, road, object overlay 표시
- 차이 히트맵 표시
- 생성 시간, 차이 타일 비율, 동굴 타일, 도로 길이, 오브젝트 수 비교

### 3. Determinism Lab

> 이미지 / 움짤 첨부 위치: 같은 seed에서 동일 hash, 다른 seed에서 다른 hash가 나오는 장면  
> <!-- <img width="2856" height="1504" alt="Determinism and mapHash validation" src="https://github.com/user-attachments/assets/..." /> -->

- 같은 recipe + seed에서 같은 `mapHash`가 나오는지 확인
- seed만 바꾸면 `mapHash`가 달라지는지 확인
- 64 / 128 / 256 크기별 생성 시간 비교

### 4. World Instance

> 이미지 / 움짤 첨부 위치: player/creature가 움직이고 portal 또는 combat 상태가 보이는 장면  
> <!-- <img width="2856" height="1504" alt="World Instance living world simulation" src="https://github.com/user-attachments/assets/..." /> -->

- 저장된 MapData를 기반으로 월드 인스턴스 생성
- player / creature 위치 저장
- collisionMap, costMap, portalMap 기반 이동
- surface / cave layer 전환
- client-side living world simulation
- toy combat, defeated, respawn 상태 저장
- 서버는 simulation tick을 돌리지 않고 state snapshot만 저장

### 5. Gallery / Explore

> 이미지 / 움짤 첨부 위치: public map 검색과 facets/filter가 함께 보이는 장면  
> <!-- <img width="2856" height="1504" alt="Gallery Explore public map search" src="https://github.com/user-attachments/assets/..." /> -->

- public map 검색
- keyword, feature, algorithm, stats, livingStats 필터
- facets 표시
- private map 검색 미노출
- Elasticsearch reindex로 PostgreSQL public map 기준 projection 재구성

### 6. My Worlds / Map Detail

> 이미지 / 움짤 첨부 위치: 내 맵 목록, 상세 화면, World Instance 진입 버튼이 보이는 장면  
> <!-- <img width="2856" height="1504" alt="My Worlds and Map Detail" src="https://github.com/user-attachments/assets/..." /> -->

- 내가 만든 MapProject 목록
- public/private 상태 확인
- MapVersion 상세 조회
- World Instance 진입
- public map publish / unpublish

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

Algorithm Lab은 포트폴리오에서 가장 설명력이 큰 화면입니다. 같은 seed와 parameter를 유지한 상태에서 알고리즘만 바꿔 결과 차이를 확인할 수 있습니다.

> 사용 팁: 아래 비교 이미지는 같은 seed, 같은 size, 같은 feature/density 조건에서 **비교하려는 알고리즘만 다르게** 캡처하면 가장 설득력 있게 보입니다.  
> 추천 캡처 모드: `/compare`에서 "전체 비교" 또는 각 알고리즘에 맞는 preview mode를 선택한 뒤 좌우가 모두 보이게 캡처합니다.

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

### 알고리즘 비교 이미지 슬롯

아래 영역은 포트폴리오에서 가장 중요한 시각 자료 자리입니다. 각 표의 placeholder 문구를 실제 이미지 또는 GIF로 교체하면 됩니다.

#### 1. 지형 알고리즘 비교

같은 seed에서 `Noise Island`와 `Radial Island`를 비교합니다. 지형 비교에서는 물/해안선/섬 윤곽이 잘 보이도록 cave, road, object overlay는 최소화하는 편이 좋습니다.

| Noise Island | Radial Island |
| --- | --- |
| 이미지 첨부 위치<br><!-- <img width="1350" alt="Noise Island terrain comparison" src="https://github.com/user-attachments/assets/..." /> --> | 이미지 첨부 위치<br><!-- <img width="1350" alt="Radial Island terrain comparison" src="https://github.com/user-attachments/assets/..." /> --> |

비교 포인트:

- `Noise Island`: 노이즈 기반이라 해안선과 섬 윤곽이 불규칙하게 흔들린다.
- `Radial Island`: 중심에서 바깥으로 낮아지는 구조라 둥근 섬, 해안 링, 중심부가 더 명확하게 보인다.

#### 2. 동굴 알고리즘 비교

같은 seed에서 `Cellular Automata`와 `Random Walk`를 비교합니다. 동굴 비교에서는 cave overlay를 켜고, 보라색 cave footprint가 화면에 잘 보이게 캡처합니다.

| Cellular Automata | Random Walk |
| --- | --- |
| 이미지 첨부 위치<br><!-- <img width="1350" alt="Cellular Automata cave comparison" src="https://github.com/user-attachments/assets/..." /> --> | 이미지 첨부 위치<br><!-- <img width="1350" alt="Random Walk cave comparison" src="https://github.com/user-attachments/assets/..." /> --> |

비교 포인트:

- `Cellular Automata`: 인접 셀 smoothing으로 넓은 방과 덩어리형 동굴권이 만들어진다.
- `Random Walk`: walker가 이동하며 흔적을 남기므로 길고 구불구불한 터널망에 가깝다.

#### 3. 도로 알고리즘 비교

같은 seed에서 `Simple Path`와 `A*`를 비교합니다. 도로 비교에서는 road overlay를 켜고, 노란색 도로가 좌우에서 어떻게 다른지 보이도록 캡처합니다.

| Simple Path | A* |
| --- | --- |
| 이미지 첨부 위치<br><!-- <img width="1350" alt="Simple Path road comparison" src="https://github.com/user-attachments/assets/..." /> --> | 이미지 첨부 위치<br><!-- <img width="1350" alt="A star road comparison" src="https://github.com/user-attachments/assets/..." /> --> |

비교 포인트:

- `Simple Path`: 중심부 또는 주요 축을 관통하는 단순 연결로를 만든다.
- `A*`: collision/cost를 고려해 막힌 지형과 높은 비용 지형을 피해 연결망을 만든다.

#### 4. 오브젝트 배치 알고리즘 비교

같은 seed에서 `Biome Density`와 `Scatter`를 비교합니다. 오브젝트 비교에서는 object overlay를 켜고, 나무/바위/마을 심볼이 잘 보이게 캡처합니다.

| Biome Density | Scatter |
| --- | --- |
| 이미지 첨부 위치<br><!-- <img width="1350" alt="Biome Density object placement comparison" src="https://github.com/user-attachments/assets/..." /> --> | 이미지 첨부 위치<br><!-- <img width="1350" alt="Scatter object placement comparison" src="https://github.com/user-attachments/assets/..." /> --> |

비교 포인트:

- `Biome Density`: forest/grass 등 조건이 맞는 바이옴에 오브젝트가 더 모인다.
- `Scatter`: 조건을 덜 타고 넓은 영역에 오브젝트가 분산된다.

#### 5. 차이 히트맵

좌우 설계의 전체 차이를 한 장으로 보여주고 싶을 때 사용합니다. 지형, 높이, 충돌, 비용, 오브젝트 차이가 함께 드러나므로 포트폴리오 설명용으로 가장 좋습니다.

> 이미지 첨부 위치: `/compare`의 차이 히트맵 모드  
> <!-- <img width="2856" height="1504" alt="Algorithm difference heatmap" src="https://github.com/user-attachments/assets/..." /> -->

비교 포인트:

- `차이 타일 %`로 두 설계가 얼마나 달라졌는지 수치화한다.
- `차이 유형`으로 지형/이동/높이/object 중 어떤 차이가 큰지 설명한다.

### 대표 비교 수치

아래 값은 local demo에서 얻은 대표 측정값입니다. 제출 전에는 `/compare`에서 다시 측정하는 것을 권장합니다.

| 항목 | Left | Right | 해석 |
| --- | ---: | ---: | --- |
| 생성 시간 | 86ms | 44ms | 알고리즘 조합에 따라 WASM 생성 비용 차이 발생 |
| 차이 타일 | 89% | 89% | 좌우 설계가 전체 맵 구조에 크게 다른 영향을 줌 |
| 동굴 타일 | 3,413 | 923 | Cellular Automata는 넓은 방, Random Walk는 좁은 터널에 가까움 |
| 도로 길이 | 578 | 1,370 | A*는 지형 비용을 피해 더 긴 연결로를 만들 수 있음 |
| 나무/바위/마을 | 207/0/1 | 85/0/1 | 배치 알고리즘에 따라 objectList 분포가 달라짐 |
| 물 비율 | 16% | 42% | terrain algorithm 조합에 따라 섬 성격 변화 |
| 숲 비율 | 33% | 22% | 지형과 오브젝트 배치 조건이 함께 영향을 줌 |

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

---

## 검증과 실험 결과

### 전체 검증

```powershell
npm run verify
```

검증 범위:

| 영역 | 검증 |
| --- | --- |
| shared contracts | 타입/검증 helper build/test |
| WASM wrapper | TypeScript wrapper build/test |
| frontend | Vite build, Vitest |
| Spring Boot API | Gradle test |
| infra | Docker compose config |

### Release 검증

```powershell
npm run verify:release
```

`verify:release`는 실제 Emscripten WASM artifact build까지 포함합니다.

### 배포 후 smoke test

```powershell
.\scripts\smoke-test-api.ps1 `
  -ApiBaseUrl "http://localhost:8080" `
  -AdminToken "local-admin-token-change-me" `
  -Prefix "WF-SMOKE"
```

검증 흐름:

- API health
- signup / login
- private map save
- private map 검색 미노출
- map publish
- reindex
- public search
- facets

---

## 로컬 실행

### 사전 설치

- Docker Desktop with Linux engine
- Node.js / npm
- Java 21
- Emscripten SDK, `em++` on `PATH`
- PowerShell 또는 Bash

### 1. 의존성 설치

```powershell
npm install
```

### 2. 환경변수 확인

```powershell
Get-Content .env.local.example
Copy-Item .env.local.example .env.local
```

실제 secret은 커밋하지 않습니다. 예제 파일은 local 실행용 placeholder만 포함합니다.

### 3. WASM artifact 빌드

Windows에서 emsdk가 `C:\emsdk`에 설치된 경우:

```powershell
& "C:\emsdk\emsdk_env.ps1"
em++ --version
npm run wasm:build
```

빌드 결과 확인:

```powershell
Test-Path apps/web/public/wasm/world_forge_engine.js
Test-Path apps/web/public/wasm/world_forge_engine.wasm
```

### 4. full-stack 실행

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example up --build
```

백그라운드 실행:

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example up --build -d
```

### 5. 접속 확인

```powershell
Invoke-RestMethod "http://localhost:8080/api/health"
Invoke-WebRequest "http://localhost:5173/editor"
curl.exe -I "http://localhost:5173/wasm/world_forge_engine.wasm"
```

정상 URL:

```txt
API health       http://localhost:8080/api/health
Frontend         http://localhost:5173
Editor           http://localhost:5173/editor
WASM artifact    http://localhost:5173/wasm/world_forge_engine.wasm
```

### 6. reindex 실행

```powershell
.\scripts\reindex-search.ps1 `
  -ApiBaseUrl "http://localhost:8080" `
  -AdminToken "local-admin-token-change-me"
```

### 7. 실패 시 로그 확인

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example logs api
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example logs web
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example logs postgres
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml --env-file .env.local.example logs elasticsearch
```

---

## 배포와 운영

### Production compose config 검증

```powershell
docker compose --env-file .env.production.example -f infra/docker-compose.prod.yml config
```

### 배포 원칙

- 실제 secret은 `.env.production.example`에 넣지 않는다.
- `WORLD_FORGE_JWT_SECRET`, `WORLD_FORGE_ADMIN_REINDEX_TOKEN`은 운영 secret manager 또는 배포 서버 env로 주입한다.
- CORS는 wildcard로 열지 않는다.
- 브라우저는 Elasticsearch를 직접 호출하지 않는다.
- Web container는 SPA fallback과 `.wasm` MIME type을 설정한다.
- API health endpoint는 `/api/health`를 사용한다.

자세한 배포 절차는 [`docs/23_DEPLOYMENT_GUIDE.md`](docs/23_DEPLOYMENT_GUIDE.md)를 참고합니다.

---

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

### 면접에서 강조할 문장

- "Spring Boot가 맵을 생성하지 않도록 제한하고, 생성은 브라우저 WASM에서 수행하도록 경계를 나눴습니다."
- "PostgreSQL은 source of truth이고 Elasticsearch는 public map 검색 projection으로만 사용했습니다."
- "같은 seed와 recipe에서 같은 mapHash가 나오도록 deterministic contract를 만들었습니다."
- "렌더러는 생성 알고리즘을 모르고 MapData만 소비합니다."
- "Algorithm Lab은 알고리즘이 terrainMap, cave footprint, road tile, objectList에 어떤 차이를 만드는지 보여주기 위해 만든 실험 화면입니다."

### 이력서용 3줄

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
