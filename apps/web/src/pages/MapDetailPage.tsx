import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { validateGenerationRecipe, type GenerationRecipe, type MapData } from "@world-forge/shared";
import { AuthStatus } from "../components/AuthStatus";
import { createEditorEngine, type EditorEngine } from "../editor/engineAdapter";
import {
  algorithmLabel,
  appName,
  featureLabel,
  formatKoreanDate,
  mapTypeLabel,
  metricLabel,
  ownerLabel as koreanOwnerLabel,
  visibilityLabel,
} from "../i18n/korean";
import { TerrainMapView } from "../renderers/canvasRenderers";
import {
  createWorldInstance,
  fetchCurrentUser,
  fetchMapProject,
  forkMapProject,
  getStoredAuthToken,
  listMyWorldInstances,
  updateMapProject,
  type AuthUserPayload,
  type MapProjectPayload,
  type MapVersionPayload,
  type WorldInstancePayload,
} from "../world/worldApi";

interface MapDetailPageProps {
  mapId: string;
}

type PageStatus = "loading" | "ready" | "error";
type ActionStatus = "idle" | "working" | "error";
type PreviewStatus = "idle" | "loading" | "ready" | "error";

export function MapDetailPage({ mapId }: MapDetailPageProps) {
  const [project, setProject] = useState<MapProjectPayload | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUserPayload | null>(null);
  const [worlds, setWorlds] = useState<WorldInstancePayload[]>([]);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [metadataTitle, setMetadataTitle] = useState("");
  const [metadataDescription, setMetadataDescription] = useState("");
  const engineRef = useRef<EditorEngine | null>(null);

  const version = project?.currentVersion ?? null;
  const isOwner = Boolean(project && currentUser && project.ownerId === currentUser.id);
  const existingWorld = useMemo(
    () => worlds.find((world) => version && world.mapVersionId === version.id) ?? null,
    [version, worlds],
  );

  const loadDetail = useCallback(async () => {
    setPageStatus("loading");
    setError(null);
    try {
      const [nextProject, user] = await Promise.all([
        fetchMapProject(mapId),
        getStoredAuthToken()
          ? fetchCurrentUser().catch(() => null)
          : Promise.resolve(null),
      ]);
      setProject(nextProject);
      setCurrentUser(user);
      setMetadataTitle(nextProject.title);
      setMetadataDescription(nextProject.description);
      setPageStatus("ready");
    } catch (unknownError) {
      setProject(null);
      setError(unknownError instanceof Error ? unknownError.message : "지도를 불러오지 못했습니다");
      setPageStatus("error");
    }
  }, [mapId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadDetail]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!getStoredAuthToken()) {
        setWorlds([]);
        return;
      }
      void listMyWorldInstances()
        .then((nextWorlds) => {
          if (!cancelled) {
            setWorlds(nextWorlds);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setWorlds([]);
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [project?.currentVersionId]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!version || version.thumbnailUrl) {
        setMapData(null);
        setPreviewStatus("idle");
        return;
      }

      setPreviewStatus("loading");
      const validation = validateGenerationRecipe(version.recipe);
      if (!validation.ok) {
        setMapData(null);
        setPreviewStatus("error");
        return;
      }

      engineRef.current ??= createEditorEngine();
      void engineRef.current
        .generate(validation.value)
        .then((generatedMap) => {
          if (!cancelled) {
            setMapData(generatedMap);
            setPreviewStatus("ready");
          }
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setMapData(null);
          setPreviewStatus("error");
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [version]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  async function openWorld() {
    if (!project || !version) {
      setError("버전이 없는 지도입니다");
      setActionStatus("error");
      return;
    }
    if (!getStoredAuthToken()) {
      setError("세계로 들어가려면 먼저 로그인해주세요");
      setActionStatus("error");
      return;
    }
    if (existingWorld) {
      window.location.assign(`/world/${encodeURIComponent(existingWorld.id)}`);
      return;
    }

    setActionStatus("working");
    setError(null);
    try {
      const source = isOwner ? project : await forkMapProject(project.id);
      if (!source.currentVersionId) {
        throw new Error("버전이 없는 지도입니다");
      }
      const world = await createWorldInstance({
        mapVersionId: source.currentVersionId,
        name: source.title,
      });
      window.location.assign(`/world/${encodeURIComponent(world.worldInstance.id)}`);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "세계를 열지 못했습니다");
      setActionStatus("error");
    }
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || !isOwner) {
      return;
    }
    setActionStatus("working");
    setError(null);
    try {
      const updated = await updateMapProject(project.id, {
        title: metadataTitle.trim(),
        description: metadataDescription.trim(),
      });
      setProject(updated);
      setMetadataOpen(false);
      setActionStatus("idle");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "지도 기록을 수정하지 못했습니다");
      setActionStatus("error");
    }
  }

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>지도 상세 기록</h1>
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
          <a className="text-link" href="/dashboard">
            내 세계
          </a>
          <a className="text-link" href="/gallery">
            탐험관
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="map-detail-shell" aria-label="지도 상세">
        {pageStatus === "loading" ? <div className="gallery-state">지도 기록을 불러오는 중...</div> : null}
        {pageStatus === "error" ? (
          <div className="map-detail-error">
            <h2>지도를 볼 수 없습니다</h2>
            <p>{error ?? "비공개 지도이거나 존재하지 않는 기록입니다."}</p>
            <a className="text-link" href="/gallery">
              탐험관으로 돌아가기
            </a>
          </div>
        ) : null}

        {project && version ? (
          <div className="map-detail-layout">
            <section className="map-detail-main">
              <div className="map-detail-title-row">
                <div>
                  <p className="map-detail-kicker">{visibilityLabel(project.visibility)}</p>
                  <h2>{project.title}</h2>
                  <p>{project.description || "아직 남긴 기록이 없습니다"}</p>
                </div>
                <span className="status-pill">{mapTypeLabel(mapTypeFromStats(version.stats))}</span>
              </div>

              <MapDetailPreview version={version} mapData={mapData} previewStatus={previewStatus} />

              <section className="map-detail-section" aria-label="지도 개요">
                <h3>세계 개요</h3>
                <dl className="map-detail-grid">
                  <DetailItem label="기록자" value={ownerLabel(project, currentUser)} />
                  <DetailItem label="시드" value={String(version.seed)} />
                  <DetailItem label="크기" value={`${version.width} x ${version.height}`} />
                  <DetailItem label="엔진" value={version.engineVersion} />
                  <DetailItem label="생성" value={formatDate(project.createdAt)} />
                  <DetailItem label="수정" value={formatDate(project.updatedAt)} />
                </dl>
              </section>

              <section className="map-detail-section" aria-label="생성 기록">
                <h3>생성 기록</h3>
                <ChipRow items={enabledFeatures(version.recipe).map(featureLabel)} fallback="켜진 요소 없음" />
                <dl className="map-detail-grid">
                  {Object.entries(version.recipe.algorithms).map(([key, value]) => (
                    <DetailItem key={key} label={metricLabel(key)} value={algorithmLabel(String(value))} />
                  ))}
                </dl>
                <MetricList values={version.recipe.params as unknown as Record<string, number>} />
              </section>

              <section className="map-detail-section" aria-label="지형 수치">
                <h3>지형 수치</h3>
                <MetricList values={selectedStats(version.stats)} />
              </section>

              <section className="map-detail-section" aria-label="생활 수치">
                <h3>살아 있는 세계</h3>
                <MetricList values={livingStatsFrom(version.stats)} emptyText="아직 생활 수치 없음" />
              </section>

              <section className="map-detail-section" aria-label="지도 인장값">
                <h3>지도 인장값</h3>
                <code className="hash-value">{version.mapHash}</code>
              </section>
            </section>

            <aside className="map-detail-actions" aria-label="지도 작업">
              <a className="generate-button text-button" href={`/editor?mapId=${encodeURIComponent(project.id)}`}>
                창조실에서 열기
              </a>
              <button type="button" className="generate-button" onClick={() => void openWorld()} disabled={actionStatus === "working"}>
                {existingWorld ? "열어둔 세계로 들어가기" : isOwner ? "세계 열기" : "내 세계로 복제해 열기"}
              </button>
              <button type="button" className="secondary-button" disabled>
                리믹스
              </button>
              {isOwner ? (
                <button type="button" className="secondary-button" onClick={() => setMetadataOpen((value) => !value)}>
                  기록 고치기
                </button>
              ) : null}
              <a className="text-link" href="/gallery">
                공개 탐험관 둘러보기
              </a>
              {error ? <p className="error-line">{error}</p> : null}

              {metadataOpen && isOwner ? (
                <form className="metadata-form" onSubmit={(event) => void saveMetadata(event)}>
                  <label>
                    <span>세계 이름</span>
                    <input type="text" value={metadataTitle} maxLength={160} onChange={(event) => setMetadataTitle(event.target.value)} />
                  </label>
                  <label>
                    <span>기록 한 줄</span>
                    <input type="text" value={metadataDescription} maxLength={2000} onChange={(event) => setMetadataDescription(event.target.value)} />
                  </label>
                  <button type="submit" className="generate-button" disabled={actionStatus === "working"}>
                    기록 저장
                  </button>
                </form>
              ) : null}
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function MapDetailPreview({
  version,
  mapData,
  previewStatus,
}: {
  version: MapVersionPayload;
  mapData: MapData | null;
  previewStatus: PreviewStatus;
}) {
  if (version.thumbnailUrl) {
    return (
      <div className="map-detail-preview">
        <img src={version.thumbnailUrl} alt={`${version.mapHash} 미리보기`} />
      </div>
    );
  }
  return (
    <div className="map-detail-preview">
      {mapData ? <TerrainMapView mapData={mapData} /> : <div className="empty-preview">{previewStatus === "loading" ? "미리보기 생성 중" : "미리보기를 만들 수 없습니다"}</div>}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ChipRow({ items, fallback }: { items: readonly string[]; fallback: string }) {
  if (items.length === 0) {
    return <div className="gallery-chip-row muted">{fallback}</div>;
  }
  return (
    <div className="gallery-chip-row">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function MetricList({ values, emptyText = "값 없음" }: { values: Record<string, number>; emptyText?: string }) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return <p className="map-detail-muted">{emptyText}</p>;
  }
  return (
    <dl className="map-detail-grid">
      {entries.map(([key, value]) => (
        <DetailItem key={key} label={metricLabel(key)} value={formatMetric(value)} />
      ))}
    </dl>
  );
}

function enabledFeatures(recipe: GenerationRecipe): string[] {
  return Object.entries(recipe.features)
    .filter(([, enabled]) => enabled)
    .map(([feature]) => feature);
}

function selectedStats(stats: Record<string, unknown>): Record<string, number> {
  return pickNumbers(stats, [
    "waterRatio",
    "landRatio",
    "forestRatio",
    "mountainRatio",
    "caveAreaRatio",
    "treeCount",
    "roadLength",
    "villageCount",
    "blockedRatio",
    "reachableAreaRatio",
    "generationTimeMs",
  ]);
}

function livingStatsFrom(stats: Record<string, unknown>): Record<string, number> {
  const nested = stats.livingStats;
  const values = typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? pickNumbers(nested as Record<string, unknown>, [
        "creatureCount",
        "surfaceCreatureCount",
        "caveCreatureCount",
        "reachableAreaRatio",
        "portalCount",
        "blockedTileRatio",
        "npcCount",
        "livingDensity",
        "creatureDensity",
      ])
    : {};
  return {
    ...pickNumbers(stats, ["creatureCount", "surfaceCreatureCount", "caveCreatureCount", "reachableAreaRatio", "portalCount"]),
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

function ownerLabel(project: MapProjectPayload, currentUser: AuthUserPayload | null): string {
  if (currentUser && project.ownerId === currentUser.id) {
    return koreanOwnerLabel(true, currentUser.nickname);
  }
  return koreanOwnerLabel(false, project.ownerId.slice(0, 8));
}

function formatMetric(value: number): string {
  if (value >= 0 && value <= 1) {
    return `${Math.round(value * 100)}%`;
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3);
}

function formatDate(value: string): string {
  try {
    return formatKoreanDate(value);
  } catch {
    return value;
  }
}
