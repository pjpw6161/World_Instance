import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { validateGenerationRecipe, type GenerationRecipe, type MapData } from "@world-forge/shared";
import { AuthStatus } from "../components/AuthStatus";
import { createEditorEngine, type EditorEngine } from "../editor/engineAdapter";
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
      setError(unknownError instanceof Error ? unknownError.message : "Could not load map");
      setPageStatus("error");
    }
  }, [mapId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!getStoredAuthToken()) {
      setWorlds([]);
      return;
    }
    void listMyWorldInstances()
      .then(setWorlds)
      .catch(() => setWorlds([]));
  }, [project?.currentVersionId]);

  useEffect(() => {
    if (!version || version.thumbnailUrl) {
      setMapData(null);
      setPreviewStatus("idle");
      return;
    }

    let cancelled = false;
    setPreviewStatus("loading");
    const validation = validateGenerationRecipe(version.recipe);
    if (!validation.ok) {
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
        if (!cancelled) {
          setMapData(null);
          setPreviewStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  async function openWorld() {
    if (!project || !version) {
      setError("Map has no version");
      setActionStatus("error");
      return;
    }
    if (!getStoredAuthToken()) {
      setError("Sign in before opening a world instance");
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
        throw new Error("Map has no version");
      }
      const world = await createWorldInstance({
        mapVersionId: source.currentVersionId,
        name: source.title,
      });
      window.location.assign(`/world/${encodeURIComponent(world.worldInstance.id)}`);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Could not open world");
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
      setError(unknownError instanceof Error ? unknownError.message : "Could not update metadata");
      setActionStatus("error");
    }
  }

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>World Forge</p>
          <h1>Map Detail</h1>
        </div>
        <nav className="top-nav" aria-label="Navigation">
          <a className="text-link" href="/editor">
            Editor
          </a>
          <a className="text-link" href="/dashboard">
            Dashboard
          </a>
          <a className="text-link" href="/gallery">
            Gallery
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="map-detail-shell" aria-label="Map detail">
        {pageStatus === "loading" ? <div className="gallery-state">Loading map...</div> : null}
        {pageStatus === "error" ? (
          <div className="map-detail-error">
            <h2>Map unavailable</h2>
            <p>{error ?? "This map is private or does not exist."}</p>
            <a className="text-link" href="/gallery">
              Back to Gallery
            </a>
          </div>
        ) : null}

        {project && version ? (
          <div className="map-detail-layout">
            <section className="map-detail-main">
              <div className="map-detail-title-row">
                <div>
                  <p className="map-detail-kicker">{project.visibility}</p>
                  <h2>{project.title}</h2>
                  <p>{project.description || "No description"}</p>
                </div>
                <span className="status-pill">{mapTypeFromStats(version.stats)}</span>
              </div>

              <MapDetailPreview version={version} mapData={mapData} previewStatus={previewStatus} />

              <section className="map-detail-section" aria-label="Map facts">
                <h3>Overview</h3>
                <dl className="map-detail-grid">
                  <DetailItem label="Owner" value={ownerLabel(project, currentUser)} />
                  <DetailItem label="Seed" value={String(version.seed)} />
                  <DetailItem label="Size" value={`${version.width} x ${version.height}`} />
                  <DetailItem label="Engine" value={version.engineVersion} />
                  <DetailItem label="Created" value={formatDate(project.createdAt)} />
                  <DetailItem label="Updated" value={formatDate(project.updatedAt)} />
                </dl>
              </section>

              <section className="map-detail-section" aria-label="Generation details">
                <h3>Generation</h3>
                <ChipRow items={enabledFeatures(version.recipe)} fallback="No enabled features" />
                <dl className="map-detail-grid">
                  {Object.entries(version.recipe.algorithms).map(([key, value]) => (
                    <DetailItem key={key} label={key} value={String(value)} />
                  ))}
                </dl>
                <MetricList values={version.recipe.params as unknown as Record<string, number>} />
              </section>

              <section className="map-detail-section" aria-label="Stats">
                <h3>Stats</h3>
                <MetricList values={selectedStats(version.stats)} />
              </section>

              <section className="map-detail-section" aria-label="Living stats">
                <h3>Living Stats</h3>
                <MetricList values={livingStatsFrom(version.stats)} emptyText="No living stats" />
              </section>

              <section className="map-detail-section" aria-label="Map hash">
                <h3>Map Hash</h3>
                <code className="hash-value">{version.mapHash}</code>
              </section>
            </section>

            <aside className="map-detail-actions" aria-label="Map actions">
              <a className="generate-button text-button" href={`/editor?mapId=${encodeURIComponent(project.id)}`}>
                Open in Editor
              </a>
              <button type="button" className="generate-button" onClick={() => void openWorld()} disabled={actionStatus === "working"}>
                {existingWorld ? "Open World Instance" : isOwner ? "Create World Instance" : "Fork & Open World"}
              </button>
              <button type="button" className="secondary-button" disabled>
                Remix
              </button>
              {isOwner ? (
                <button type="button" className="secondary-button" onClick={() => setMetadataOpen((value) => !value)}>
                  Edit Metadata
                </button>
              ) : null}
              <a className="text-link" href="/gallery">
                Explore public maps
              </a>
              {error ? <p className="error-line">{error}</p> : null}

              {metadataOpen && isOwner ? (
                <form className="metadata-form" onSubmit={(event) => void saveMetadata(event)}>
                  <label>
                    <span>Title</span>
                    <input type="text" value={metadataTitle} maxLength={160} onChange={(event) => setMetadataTitle(event.target.value)} />
                  </label>
                  <label>
                    <span>Description</span>
                    <input type="text" value={metadataDescription} maxLength={2000} onChange={(event) => setMetadataDescription(event.target.value)} />
                  </label>
                  <button type="submit" className="generate-button" disabled={actionStatus === "working"}>
                    Save Metadata
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
        <img src={version.thumbnailUrl} alt={`${version.mapHash} thumbnail`} />
      </div>
    );
  }
  return (
    <div className="map-detail-preview">
      {mapData ? <TerrainMapView mapData={mapData} /> : <div className="empty-preview">{previewStatus === "loading" ? "Loading preview" : "Preview unavailable"}</div>}
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

function MetricList({ values, emptyText = "No values" }: { values: Record<string, number>; emptyText?: string }) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return <p className="map-detail-muted">{emptyText}</p>;
  }
  return (
    <dl className="map-detail-grid">
      {entries.map(([key, value]) => (
        <DetailItem key={key} label={key} value={formatMetric(value)} />
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
    return `${currentUser.nickname} (you)`;
  }
  return `owner ${project.ownerId.slice(0, 8)}`;
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
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}
