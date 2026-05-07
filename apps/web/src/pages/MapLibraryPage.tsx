import { useCallback, useEffect, useState } from "react";
import { AuthStatus } from "../components/AuthStatus";
import { appName, statusLabel, visibilityLabel } from "../i18n/korean";
import {
  createWorldInstance,
  getStoredAuthToken,
  listMyMaps,
  updateMapProjectVisibility,
  type MapProjectPayload,
  type MapVisibility,
} from "../world/worldApi";

type LibraryStatus = "loading" | "ready" | "saving" | "error";

export function MapLibraryPage() {
  const [maps, setMaps] = useState<MapProjectPayload[]>([]);
  const [status, setStatus] = useState<LibraryStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const loadMaps = useCallback(async () => {
    if (!getStoredAuthToken()) {
      setStatus("error");
      setError("로그인이 필요합니다");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      setMaps(await listMyMaps());
      setStatus("ready");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "내 지도를 불러오지 못했습니다");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadMaps();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadMaps]);

  async function setVisibility(project: MapProjectPayload, visibility: MapVisibility) {
    setStatus("saving");
    setError(null);
    try {
      const updated = await updateMapProjectVisibility(project.id, visibility);
      setMaps((currentMaps) => currentMaps.map((item) => (item.id === updated.id ? updated : item)));
      setStatus("ready");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "지도를 갱신하지 못했습니다");
      setStatus("error");
    }
  }

  async function openWorld(project: MapProjectPayload) {
    if (!project.currentVersionId) {
      setError("버전이 없는 지도입니다");
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
      setError(unknownError instanceof Error ? unknownError.message : "세계를 열지 못했습니다");
      setStatus("error");
    }
  }

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>내 지도 서가</h1>
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

      <section className="library-shell" aria-label="저장된 지도">
        <div className="library-toolbar">
          <span className="status-pill">{statusLabel(status)}</span>
          <button type="button" className="secondary-button" onClick={() => void loadMaps()} disabled={status === "loading"}>
            새로고침
          </button>
        </div>
        {error ? <p className="error-line">{error}</p> : null}
        <div className="map-list">
          {maps.map((project) => (
            <article key={project.id} className="map-list-item">
              <div>
                <h2>{project.title}</h2>
                <p>{project.description || "아직 남긴 기록이 없습니다"}</p>
                <code>{project.currentVersion?.mapHash ?? "버전 없음"}</code>
              </div>
              <dl className="map-meta">
                <div>
                  <dt>공개 상태</dt>
                  <dd>{visibilityLabel(project.visibility)}</dd>
                </div>
                <div>
                  <dt>크기</dt>
                  <dd>
                    {project.currentVersion ? `${project.currentVersion.width} x ${project.currentVersion.height}` : "-"}
                  </dd>
                </div>
                <div>
                  <dt>수정</dt>
                  <dd>{new Date(project.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>
              <div className="map-actions">
                <a className="secondary-button text-button" href={`/maps/${encodeURIComponent(project.id)}`}>
                  상세 기록
                </a>
                <button type="button" className="generate-button" onClick={() => void openWorld(project)} disabled={!project.currentVersionId || status === "saving"}>
                  세계로 들어가기
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void setVisibility(project, project.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC")}
                  disabled={!project.currentVersionId || status === "saving"}
                >
                  {project.visibility === "PUBLIC" ? "비공개로 돌리기" : "공개하기"}
                </button>
              </div>
            </article>
          ))}
          {maps.length === 0 && status !== "loading" ? (
            <div className="empty-preview library-empty">
              <a className="text-link" href="/editor">
                첫 세계 빚기
              </a>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
