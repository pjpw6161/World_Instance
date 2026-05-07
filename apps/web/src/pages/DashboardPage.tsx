import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthStatus } from "../components/AuthStatus";
import { appName, formatKoreanDate, mapTypeLabel, statusLabel, visibilityLabel } from "../i18n/korean";
import {
  createWorldInstance,
  getStoredAuthToken,
  listMyMaps,
  listMyWorldInstances,
  updateMapProjectVisibility,
  type MapProjectPayload,
  type MapVersionPayload,
  type MapVisibility,
  type WorldInstancePayload,
} from "../world/worldApi";

type DashboardStatus = "loading" | "ready" | "saving" | "error";

export function DashboardPage() {
  const [maps, setMaps] = useState<MapProjectPayload[]>([]);
  const [worlds, setWorlds] = useState<WorldInstancePayload[]>([]);
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const worldsByVersion = useMemo(() => {
    const values = new Map<string, WorldInstancePayload[]>();
    for (const world of worlds) {
      const current = values.get(world.mapVersionId) ?? [];
      current.push(world);
      values.set(world.mapVersionId, current);
    }
    return values;
  }, [worlds]);

  const mapsByVersion = useMemo(() => {
    const values = new Map<string, MapProjectPayload>();
    for (const project of maps) {
      if (project.currentVersionId) {
        values.set(project.currentVersionId, project);
      }
    }
    return values;
  }, [maps]);

  const loadDashboard = useCallback(async () => {
    if (!getStoredAuthToken()) {
      setStatus("error");
      setError("로그인이 필요합니다");
      setMaps([]);
      setWorlds([]);
      return;
    }

    setStatus("loading");
    setError(null);
    try {
      const [nextMaps, nextWorlds] = await Promise.all([listMyMaps(), listMyWorldInstances()]);
      setMaps(nextMaps);
      setWorlds(nextWorlds);
      setStatus("ready");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "내 세계 목록을 불러오지 못했습니다");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadDashboard]);

  async function setVisibility(project: MapProjectPayload, visibility: MapVisibility) {
    setStatus("saving");
    setError(null);
    try {
      const updated = await updateMapProjectVisibility(project.id, visibility);
      setMaps((currentMaps) => currentMaps.map((item) => (item.id === updated.id ? updated : item)));
      setStatus("ready");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "공개 상태를 바꾸지 못했습니다");
      setStatus("error");
    }
  }

  async function openWorldForMap(project: MapProjectPayload) {
    if (!project.currentVersionId) {
      setError("현재 버전이 없는 지도입니다");
      setStatus("error");
      return;
    }

    const existingWorld = worldsByVersion.get(project.currentVersionId)?.[0];
    if (existingWorld) {
      window.location.assign(`/world/${encodeURIComponent(existingWorld.id)}`);
      return;
    }

    setStatus("saving");
    setError(null);
    try {
      const world = await createWorldInstance({
        mapVersionId: project.currentVersionId,
        name: project.title,
      });
      window.location.assign(`/world/${encodeURIComponent(world.worldInstance.id)}`);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "월드 인스턴스를 만들지 못했습니다");
      setStatus("error");
    }
  }

  function archivePlaceholder(label: string) {
    window.confirm(`보관함 기능은 아직 준비 중입니다. '${label}'은 변경되지 않았습니다.`);
  }

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>내 세계 서가</h1>
        </div>
        <nav className="top-nav" aria-label="이동">
          <a className="text-link" href="/portfolio">
            포트폴리오
          </a>
          <a className="text-link" href="/editor">
            창조실
          </a>
          <a className="text-link" href="/compare">
            비교실
          </a>
          <a className="text-link" href="/determinism">
            결정성
          </a>
          <a className="text-link" href="/gallery">
            탐험관
          </a>
          <a className="text-link" href="/maps">
            내 지도
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="dashboard-shell" aria-label="내 세계 현황">
        <div className="dashboard-toolbar">
          <span className="status-pill">{statusLabel(status)}</span>
          <button type="button" className="secondary-button" onClick={() => void loadDashboard()} disabled={status === "loading"}>
            새로고침
          </button>
        </div>
        {error ? <p className="error-line">{error}</p> : null}

        <div className="dashboard-layout">
          <section className="dashboard-section" aria-label="내 지도 프로젝트">
            <div className="dashboard-section-heading">
              <h2>지도 프로젝트</h2>
              <span>{maps.length}개 지도</span>
            </div>
            {status === "loading" ? <div className="gallery-state">지도를 불러오는 중...</div> : null}
            {status !== "loading" && maps.length === 0 ? <EmptyState href="/editor" label="첫 세계 빚기" /> : null}
            <div className="dashboard-card-list">
              {maps.map((project) => (
                <MapProjectCard
                  key={project.id}
                  project={project}
                  worlds={project.currentVersionId ? worldsByVersion.get(project.currentVersionId) ?? [] : []}
                  busy={status === "saving"}
                  onOpenWorld={() => void openWorldForMap(project)}
                  onToggleVisibility={() => void setVisibility(project, project.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC")}
                  onArchive={() => archivePlaceholder(project.title)}
                />
              ))}
            </div>
          </section>

          <section className="dashboard-section" aria-label="내 월드 인스턴스">
            <div className="dashboard-section-heading">
              <h2>살아 있는 세계</h2>
              <span>{worlds.length}개 세계</span>
            </div>
            {status === "loading" ? <div className="gallery-state">세계 상태를 불러오는 중...</div> : null}
            {status !== "loading" && worlds.length === 0 ? <EmptyState href="/editor" label="지도에서 세계 열기" /> : null}
            <div className="dashboard-world-list">
              {worlds.map((world) => (
                <WorldInstanceCard
                  key={world.id}
                  world={world}
                  project={mapsByVersion.get(world.mapVersionId)}
                  onArchive={() => archivePlaceholder(world.name)}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function MapProjectCard({
  project,
  worlds,
  busy,
  onOpenWorld,
  onToggleVisibility,
  onArchive,
}: {
  project: MapProjectPayload;
  worlds: readonly WorldInstancePayload[];
  busy: boolean;
  onOpenWorld: () => void;
  onToggleVisibility: () => void;
  onArchive: () => void;
}) {
  const version = project.currentVersion;
  const livingStats = version ? livingStatsFrom(version.stats) : {};
  return (
    <article className="dashboard-map-card">
      <MapThumbnail version={version} />
      <div className="dashboard-card-body">
        <div className="dashboard-card-title">
          <div>
            <h3>{project.title}</h3>
            <p>{project.description || "아직 남긴 기록이 없습니다"}</p>
          </div>
          <span className={`visibility-pill ${project.visibility.toLowerCase()}`}>{visibilityLabel(project.visibility)}</span>
        </div>
        <dl className="dashboard-meta-grid">
          <MetaItem label="크기" value={version ? `${version.width} x ${version.height}` : "-"} />
          <MetaItem label="생명체" value={formatNumber(livingStats.creatureCount)} />
          <MetaItem label="탐험 가능" value={formatRatio(livingStats.reachableAreaRatio)} />
          <MetaItem label="생성" value={formatDate(project.createdAt)} />
          <MetaItem label="수정" value={formatDate(project.updatedAt)} />
          <MetaItem label="세계" value={String(worlds.length)} />
        </dl>
      </div>
      <div className="dashboard-actions">
        <a className="secondary-button text-button" href={`/editor?mapId=${encodeURIComponent(project.id)}`}>
          창조실에서 열기
        </a>
        <button type="button" className="generate-button" onClick={onOpenWorld} disabled={!version || busy}>
          {worlds.length > 0 ? "세계로 들어가기" : "세계 열기"}
        </button>
        <a className="secondary-button text-button" href={`/maps/${encodeURIComponent(project.id)}`}>
          상세 기록
        </a>
        <button type="button" className="secondary-button" onClick={onToggleVisibility} disabled={!version || busy}>
          {project.visibility === "PUBLIC" ? "비공개로 돌리기" : "공개하기"}
        </button>
        <button type="button" className="secondary-button" onClick={onArchive}>
          보관
        </button>
      </div>
    </article>
  );
}

function WorldInstanceCard({
  world,
  project,
  onArchive,
}: {
  world: WorldInstancePayload;
  project?: MapProjectPayload;
  onArchive: () => void;
}) {
  return (
    <article className="dashboard-world-card">
      <div>
        <h3>{world.name}</h3>
        <p>{project?.title ?? `지도 버전 ${world.mapVersionId.slice(0, 8)}`}</p>
      </div>
      <dl className="dashboard-meta-grid compact">
        <MetaItem label="마지막 저장" value={formatDate(world.lastSavedAt)} />
        <MetaItem label="생성" value={formatDate(world.createdAt)} />
        <MetaItem label="세계 시간" value={String(world.worldTime)} />
        <MetaItem label="공개 상태" value={project ? visibilityLabel(project.visibility) : "-"} />
      </dl>
      <div className="dashboard-actions inline">
        <a className="generate-button text-button" href={`/world/${encodeURIComponent(world.id)}`}>
          세계로 들어가기
        </a>
        {project ? (
          <>
            <a className="secondary-button text-button" href={`/editor?mapId=${encodeURIComponent(project.id)}`}>
              창조실
            </a>
            <a className="secondary-button text-button" href={`/maps/${encodeURIComponent(project.id)}`}>
              상세 기록
            </a>
          </>
        ) : null}
        <button type="button" className="secondary-button" onClick={onArchive}>
          보관
        </button>
      </div>
    </article>
  );
}

function MapThumbnail({ version }: { version: MapVersionPayload | null }) {
  if (version?.thumbnailUrl) {
    return (
      <div className="dashboard-thumbnail">
        <img src={version.thumbnailUrl} alt={`${version.mapHash} 미리보기`} loading="lazy" />
      </div>
    );
  }
  return (
    <div className="dashboard-thumbnail placeholder">
      <strong>{version ? mapTypeLabel(mapTypeFromStats(version.stats)) : "지도 없음"}</strong>
      <span>{version?.mapHash.slice(0, 10) ?? "버전 없음"}</span>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EmptyState({ href, label }: { href: string; label: string }) {
  return (
    <div className="empty-preview library-empty">
      <a className="text-link" href={href}>
        {label}
      </a>
    </div>
  );
}

function livingStatsFrom(stats: Record<string, unknown>): Record<string, number> {
  const nested = stats.livingStats;
  const values = typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? pickNumbers(nested as Record<string, unknown>, ["creatureCount", "reachableAreaRatio", "portalCount"])
    : {};
  return {
    ...pickNumbers(stats, ["creatureCount", "reachableAreaRatio", "portalCount"]),
    ...values,
  };
}

function pickNumbers(source: Record<string, unknown>, keys: readonly string[]): Record<string, number> {
  const values: Record<string, number> = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      values[key] = value;
    }
  }
  return values;
}

function mapTypeFromStats(stats: Record<string, unknown>): string {
  const cave = numberAt(stats, "caveAreaRatio");
  const water = numberAt(stats, "waterRatio");
  const forest = numberAt(stats, "forestRatio");
  const mountain = numberAt(stats, "mountainRatio");
  if (cave >= 0.12) {
    return "cave";
  }
  if (water >= 0.45) {
    return "archipelago";
  }
  if (mountain >= 0.25) {
    return "mountain";
  }
  if (forest >= 0.35) {
    return "forest";
  }
  return "mixed";
}

function numberAt(values: Record<string, unknown>, key: string): number {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatRatio(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "-";
}

function formatNumber(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "0";
}

function formatDate(value: string): string {
  return formatKoreanDate(value);
}
