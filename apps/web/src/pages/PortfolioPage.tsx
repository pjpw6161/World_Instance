import { AuthStatus } from "../components/AuthStatus";
import { appName } from "../i18n/korean";

const pillars = [
  {
    title: "브라우저 WASM 생성 엔진",
    label: "C++ / Emscripten",
    body: "지도 생성은 브라우저에서 실행되고, Spring Boot는 저장과 검색만 담당합니다.",
  },
  {
    title: "결정적 mapHash 계약",
    label: "Same recipe, same hash",
    body: "같은 seed와 recipe는 같은 mapHash를 만들고, 버전 저장의 기준값으로 사용됩니다.",
  },
  {
    title: "PostgreSQL source of truth",
    label: "Search as projection",
    body: "공개 지도만 Elasticsearch에 투영하고, 원본 데이터는 PostgreSQL에 유지합니다.",
  },
  {
    title: "Client-side Living World",
    label: "No server tick",
    body: "플레이어와 생명체 이동, 장난감 전투, respawn은 브라우저 상태로 돌고 서버는 snapshot만 저장합니다.",
  },
];

const demoSteps = [
  {
    title: "알고리즘 비교",
    route: "/compare",
    command: "같은 seed에서 지형/동굴/도로/오브젝트 배치 알고리즘만 바꿔 비교",
    result: "생성 결과와 mapHash 차이가 한 화면에서 보입니다.",
  },
  {
    title: "결정성 / 성능 검증",
    route: "/determinism",
    command: "같은 recipe를 두 번 생성하고, seed만 바꾼 결과를 비교",
    result: "반복 생성 hash 일치와 크기별 생성 시간이 표시됩니다.",
  },
  {
    title: "샘플 세계 생성",
    route: "/editor",
    command: "Forest, Cave, Archipelago, Highland preset 중 하나 선택 후 Generate",
    result: "WASM 생성 여부, stats, 2D/3D preview, mapHash를 확인합니다.",
  },
  {
    title: "저장과 월드 진입",
    route: "/dashboard",
    command: "로그인 후 지도 저장, My Worlds에서 World Instance 열기",
    result: "소유한 지도와 저장된 월드 snapshot을 확인합니다.",
  },
  {
    title: "공개 검색",
    route: "/gallery",
    command: "지도를 public으로 전환하고 feature / stats / livingStats 필터 적용",
    result: "private 지도는 검색되지 않고 public 지도만 노출됩니다.",
  },
];

const readinessItems = [
  ["Clean clone", "README 기준 local full-stack 실행 순서 정리"],
  ["WASM artifact", "apps/web/public/wasm 경로로 build/serve"],
  ["API health", "GET /api/health"],
  ["Reindex", "Spring Boot admin endpoint를 호출하는 scripts/reindex-search"],
  ["Smoke test", "signup, login, save, publish, search, facets, reindex 확인"],
  ["CI", "npm run verify를 GitHub Actions에서 실행"],
];

const commandCards = [
  {
    title: "전체 검증",
    code: "npm run verify",
  },
  {
    title: "검색 재색인",
    code: '.\\scripts\\reindex-search.ps1 -ApiBaseUrl "http://localhost:8080" -AdminToken "local-admin-token-change-me"',
  },
  {
    title: "배포 Smoke Test",
    code: '.\\scripts\\smoke-test-api.ps1 -ApiBaseUrl "http://localhost:8080" -AdminToken "local-admin-token-change-me" -Prefix "WF-SMOKE"',
  },
];

export function PortfolioPage() {
  return (
    <main className="editor-shell portfolio-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>포트폴리오 시연실</h1>
        </div>
        <nav className="top-nav" aria-label="이동">
          <a className="text-link" href="/editor">
            창조실
          </a>
          <a className="text-link" href="/compare">
            비교실
          </a>
          <a className="text-link" href="/determinism">
            결정성 검증
          </a>
          <a className="text-link" href="/gallery">
            탐험관
          </a>
          <a className="text-link" href="/dashboard">
            내 세계
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="portfolio-hero">
        <div className="portfolio-hero-copy">
          <span className="stat-label">10 minute technical demo</span>
          <h2>World Forge를 설명하기 위한 시연 동선과 기술 포인트를 한 화면에 모았습니다</h2>
          <p>
            면접이나 포트폴리오 발표에서 바로 열 수 있는 시작점입니다. 알고리즘 비교, 결정성 검증,
            저장/검색/월드 인스턴스까지 이어지는 흐름을 짧게 보여줍니다.
          </p>
          <div className="portfolio-actions">
            <a className="generate-button" href="/compare">
              알고리즘 비교 시작
            </a>
            <a className="secondary-button" href="/determinism">
              결정성 검증 보기
            </a>
          </div>
        </div>
        <div className="portfolio-demo-card" aria-label="프로젝트 요약">
          <span>World Forge MVP</span>
          <strong>Browser-first Procedural World Platform</strong>
          <small>React + C++/WASM + Spring Boot + PostgreSQL + Elasticsearch</small>
        </div>
      </section>

      <section className="portfolio-section" aria-label="핵심 설계">
        <div className="portfolio-section-heading">
          <span className="stat-label">Architecture story</span>
          <h2>설계에서 강조할 네 가지 경계</h2>
        </div>
        <div className="portfolio-pillar-grid">
          {pillars.map((pillar) => (
            <article className="portfolio-pillar" key={pillar.title}>
              <span>{pillar.label}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="portfolio-section" aria-label="시연 순서">
        <div className="portfolio-section-heading">
          <span className="stat-label">Demo path</span>
          <h2>추천 시연 순서</h2>
        </div>
        <div className="portfolio-timeline">
          {demoSteps.map((step, index) => (
            <article className="portfolio-step" key={step.title}>
              <span className="portfolio-step-index">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.command}</p>
                <small>{step.result}</small>
              </div>
              <a className="secondary-button" href={step.route}>
                열기
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="portfolio-section portfolio-two-column" aria-label="검증과 명령">
        <div className="portfolio-panel">
          <div className="portfolio-section-heading">
            <span className="stat-label">Release proof</span>
            <h2>현재 보여줄 수 있는 검증 포인트</h2>
          </div>
          <ul className="portfolio-check-list">
            {readinessItems.map(([title, body]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="portfolio-panel">
          <div className="portfolio-section-heading">
            <span className="stat-label">Commands</span>
            <h2>시연 전에 돌릴 명령</h2>
          </div>
          <div className="portfolio-command-list">
            {commandCards.map((card) => (
              <article key={card.title}>
                <strong>{card.title}</strong>
                <code>{card.code}</code>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="portfolio-section portfolio-interview-notes" aria-label="면접 설명 포인트">
        <div className="portfolio-section-heading">
          <span className="stat-label">Interview notes</span>
          <h2>짧게 설명하면 좋은 포인트</h2>
        </div>
        <div className="portfolio-note-grid">
          <p>
            <strong>왜 WASM인가:</strong> 생성 비용이 큰 로직을 서버가 맡지 않고, 브라우저에서 결정적으로
            실행해 저장/검색 서버와 책임을 분리했습니다.
          </p>
          <p>
            <strong>왜 mapHash인가:</strong> recipe와 생성 결과를 버전 단위로 추적하고, 같은 입력이 같은
            결과를 만든다는 것을 사용자에게 보여주기 위해서입니다.
          </p>
          <p>
            <strong>왜 projection인가:</strong> 검색 최적화는 Elasticsearch가 맡되, private/public 권한과
            원본 데이터는 PostgreSQL 기준으로 통제합니다.
          </p>
        </div>
      </section>
    </main>
  );
}
