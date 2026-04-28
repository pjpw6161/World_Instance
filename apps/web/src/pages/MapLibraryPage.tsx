import { useCallback, useEffect, useState } from "react";
import { AuthStatus } from "../components/AuthStatus";
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
      setError("Sign in required");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      setMaps(await listMyMaps());
      setStatus("ready");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Could not load maps");
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
      setError(unknownError instanceof Error ? unknownError.message : "Could not update map");
      setStatus("error");
    }
  }

  async function openWorld(project: MapProjectPayload) {
    if (!project.currentVersionId) {
      setError("Map has no version");
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
      setError(unknownError instanceof Error ? unknownError.message : "Could not create world");
      setStatus("error");
    }
  }

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>World Forge</p>
          <h1>My Maps</h1>
        </div>
        <nav className="top-nav" aria-label="Navigation">
          <a className="text-link" href="/editor">
            Editor
          </a>
          <a className="text-link" href="/search">
            Search
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="library-shell" aria-label="Saved maps">
        <div className="library-toolbar">
          <span className="status-pill">{status}</span>
          <button type="button" className="secondary-button" onClick={() => void loadMaps()} disabled={status === "loading"}>
            Refresh
          </button>
        </div>
        {error ? <p className="error-line">{error}</p> : null}
        <div className="map-list">
          {maps.map((project) => (
            <article key={project.id} className="map-list-item">
              <div>
                <h2>{project.title}</h2>
                <p>{project.description || "No description"}</p>
                <code>{project.currentVersion?.mapHash ?? "no version"}</code>
              </div>
              <dl className="map-meta">
                <div>
                  <dt>Visibility</dt>
                  <dd>{project.visibility}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>
                    {project.currentVersion ? `${project.currentVersion.width} x ${project.currentVersion.height}` : "-"}
                  </dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{new Date(project.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>
              <div className="map-actions">
                <button type="button" className="generate-button" onClick={() => void openWorld(project)} disabled={!project.currentVersionId || status === "saving"}>
                  Open World
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void setVisibility(project, project.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC")}
                  disabled={!project.currentVersionId || status === "saving"}
                >
                  {project.visibility === "PUBLIC" ? "Make Private" : "Publish"}
                </button>
              </div>
            </article>
          ))}
          {maps.length === 0 && status !== "loading" ? (
            <div className="empty-preview library-empty">
              <a className="text-link" href="/editor">
                Create a map
              </a>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
