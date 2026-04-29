import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthStatus } from "../components/AuthStatus";
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
      setError("Sign in required");
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
      setError(unknownError instanceof Error ? unknownError.message : "Could not load dashboard");
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
      setError(unknownError instanceof Error ? unknownError.message : "Could not update map visibility");
      setStatus("error");
    }
  }

  async function openWorldForMap(project: MapProjectPayload) {
    if (!project.currentVersionId) {
      setError("Map has no current version");
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
      setError(unknownError instanceof Error ? unknownError.message : "Could not create world instance");
      setStatus("error");
    }
  }

  function archivePlaceholder(label: string) {
    window.confirm(`Archive is not implemented yet. ${label} was not changed.`);
  }

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>World Forge</p>
          <h1>My Worlds</h1>
        </div>
        <nav className="top-nav" aria-label="Navigation">
          <a className="text-link" href="/editor">
            Editor
          </a>
          <a className="text-link" href="/gallery">
            Gallery
          </a>
          <a className="text-link" href="/maps">
            My Maps
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="dashboard-shell" aria-label="My worlds dashboard">
        <div className="dashboard-toolbar">
          <span className="status-pill">{status}</span>
          <button type="button" className="secondary-button" onClick={() => void loadDashboard()} disabled={status === "loading"}>
            Refresh
          </button>
        </div>
        {error ? <p className="error-line">{error}</p> : null}

        <div className="dashboard-layout">
          <section className="dashboard-section" aria-label="My map projects">
            <div className="dashboard-section-heading">
              <h2>Map Projects</h2>
              <span>{maps.length} maps</span>
            </div>
            {status === "loading" ? <div className="gallery-state">Loading maps...</div> : null}
            {status !== "loading" && maps.length === 0 ? <EmptyState href="/editor" label="Create a map" /> : null}
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

          <section className="dashboard-section" aria-label="My world instances">
            <div className="dashboard-section-heading">
              <h2>World Instances</h2>
              <span>{worlds.length} worlds</span>
            </div>
            {status === "loading" ? <div className="gallery-state">Loading worlds...</div> : null}
            {status !== "loading" && worlds.length === 0 ? <EmptyState href="/editor" label="Create a world from a map" /> : null}
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
            <p>{project.description || "No description"}</p>
          </div>
          <span className={`visibility-pill ${project.visibility.toLowerCase()}`}>{project.visibility.toLowerCase()}</span>
        </div>
        <dl className="dashboard-meta-grid">
          <MetaItem label="Size" value={version ? `${version.width} x ${version.height}` : "-"} />
          <MetaItem label="Creatures" value={formatNumber(livingStats.creatureCount)} />
          <MetaItem label="Reachable" value={formatRatio(livingStats.reachableAreaRatio)} />
          <MetaItem label="Created" value={formatDate(project.createdAt)} />
          <MetaItem label="Updated" value={formatDate(project.updatedAt)} />
          <MetaItem label="Worlds" value={String(worlds.length)} />
        </dl>
      </div>
      <div className="dashboard-actions">
        <a className="secondary-button text-button" href={`/editor?mapId=${encodeURIComponent(project.id)}`}>
          Open Editor
        </a>
        <button type="button" className="generate-button" onClick={onOpenWorld} disabled={!version || busy}>
          {worlds.length > 0 ? "Open World" : "Create World"}
        </button>
        <a className="secondary-button text-button" href={`/maps/${encodeURIComponent(project.id)}`}>
          Open Detail
        </a>
        <button type="button" className="secondary-button" onClick={onToggleVisibility} disabled={!version || busy}>
          {project.visibility === "PUBLIC" ? "Make Private" : "Publish"}
        </button>
        <button type="button" className="secondary-button" onClick={onArchive}>
          Archive
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
        <p>{project?.title ?? `Map version ${world.mapVersionId.slice(0, 8)}`}</p>
      </div>
      <dl className="dashboard-meta-grid compact">
        <MetaItem label="Last saved" value={formatDate(world.lastSavedAt)} />
        <MetaItem label="Created" value={formatDate(world.createdAt)} />
        <MetaItem label="World time" value={String(world.worldTime)} />
        <MetaItem label="Visibility" value={project?.visibility.toLowerCase() ?? "-"} />
      </dl>
      <div className="dashboard-actions inline">
        <a className="generate-button text-button" href={`/world/${encodeURIComponent(world.id)}`}>
          Open World
        </a>
        {project ? (
          <>
            <a className="secondary-button text-button" href={`/editor?mapId=${encodeURIComponent(project.id)}`}>
              Open Editor
            </a>
            <a className="secondary-button text-button" href={`/maps/${encodeURIComponent(project.id)}`}>
              Open Detail
            </a>
          </>
        ) : null}
        <button type="button" className="secondary-button" onClick={onArchive}>
          Archive
        </button>
      </div>
    </article>
  );
}

function MapThumbnail({ version }: { version: MapVersionPayload | null }) {
  if (version?.thumbnailUrl) {
    return (
      <div className="dashboard-thumbnail">
        <img src={version.thumbnailUrl} alt={`${version.mapHash} thumbnail`} loading="lazy" />
      </div>
    );
  }
  return (
    <div className="dashboard-thumbnail placeholder">
      <strong>{version ? mapTypeFromStats(version.stats) : "no map"}</strong>
      <span>{version?.mapHash.slice(0, 10) ?? "no version"}</span>
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
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}
