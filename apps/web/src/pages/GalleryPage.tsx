import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AuthStatus } from "../components/AuthStatus";
import {
  createWorldInstance,
  fetchMapProject,
  fetchSearchFacets,
  forkMapProject,
  getStoredAuthToken,
  searchMaps,
  type FacetBucketPayload,
  type MapProjectPayload,
  type MapSearchFacetsPayload,
  type MapSearchPayload,
  type MapSearchResultPayload,
  type SearchMapsInput,
} from "../world/worldApi";

const featureChoices = ["trees", "roads", "caves", "rivers", "villages"] as const;
const mapTypeChoices = ["mixed", "forest", "mountain", "archipelago", "cave"] as const;
const terrainAlgorithms = ["noise-island", "radial-island"] as const;
const caveAlgorithms = ["cellular-automata", "random-walk"] as const;
const roadAlgorithms = ["astar", "simple-path"] as const;
const sortChoices = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "mostCreatures", label: "Most creatures" },
  { value: "mostExplorable", label: "Most explorable" },
] as const;

type FeatureName = (typeof featureChoices)[number];

type GalleryFilters = {
  keyword: string;
  mapType: string;
  features: Record<FeatureName, boolean>;
  terrainAlgorithm: string;
  caveAlgorithm: string;
  roadAlgorithm: string;
  minWidth: string;
  maxWidth: string;
  minHeight: string;
  maxHeight: string;
  minForestRatio: string;
  maxForestRatio: string;
  minMountainRatio: string;
  maxMountainRatio: string;
  minWaterRatio: string;
  maxWaterRatio: string;
  minLandRatio: string;
  maxLandRatio: string;
  minCreatureCount: string;
  maxCreatureCount: string;
  minReachableAreaRatio: string;
  maxReachableAreaRatio: string;
  minPortalCount: string;
  maxPortalCount: string;
  sort: SearchMapsInput["sort"];
};

type GalleryTextField = Exclude<keyof GalleryFilters, "features" | "sort">;

const defaultFilters: GalleryFilters = {
  keyword: "",
  mapType: "",
  features: {
    trees: false,
    roads: false,
    caves: false,
    rivers: false,
    villages: false,
  },
  terrainAlgorithm: "",
  caveAlgorithm: "",
  roadAlgorithm: "",
  minWidth: "",
  maxWidth: "",
  minHeight: "",
  maxHeight: "",
  minForestRatio: "",
  maxForestRatio: "",
  minMountainRatio: "",
  maxMountainRatio: "",
  minWaterRatio: "",
  maxWaterRatio: "",
  minLandRatio: "",
  maxLandRatio: "",
  minCreatureCount: "",
  maxCreatureCount: "",
  minReachableAreaRatio: "",
  maxReachableAreaRatio: "",
  minPortalCount: "",
  maxPortalCount: "",
  sort: "newest",
};

interface GalleryPageProps {
  detailProjectId?: string;
}

export function GalleryPage({ detailProjectId }: GalleryPageProps) {
  const [filters, setFilters] = useState<GalleryFilters>(defaultFilters);
  const [results, setResults] = useState<MapSearchPayload | null>(null);
  const [facets, setFacets] = useState<MapSearchFacetsPayload | null>(null);
  const [detail, setDetail] = useState<MapProjectPayload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error">("idle");
  const [actionStatus, setActionStatus] = useState<"idle" | "forking" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => buildSearchInput(filters), [filters]);

  const runSearch = useCallback(async (nextQuery: SearchMapsInput) => {
    setStatus("loading");
    setError(null);
    try {
      const nextResults = await searchMaps(nextQuery);
      setResults(nextResults);
      setStatus("idle");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Search failed");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void fetchSearchFacets()
      .then(setFacets)
      .catch(() => setFacets(null));
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void runSearch(query);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [query, runSearch]);

  useEffect(() => {
    if (!detailProjectId) {
      setDetail(null);
      setDetailStatus("idle");
      return;
    }
    setDetailStatus("loading");
    setError(null);
    void fetchMapProject(detailProjectId)
      .then((project) => {
        setDetail(project);
        setDetailStatus("idle");
      })
      .catch((unknownError) => {
        setDetail(null);
        setDetailStatus("error");
        setError(unknownError instanceof Error ? unknownError.message : "Could not load map detail");
      });
  }, [detailProjectId]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(query);
  }

  function updateTextFilter(field: GalleryTextField) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFilters((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  function updateSort(event: ChangeEvent<HTMLSelectElement>) {
    setFilters((current) => ({ ...current, sort: event.target.value as SearchMapsInput["sort"] }));
  }

  function toggleFeature(feature: FeatureName) {
    setFilters((current) => ({
      ...current,
      features: {
        ...current.features,
        [feature]: !current.features[feature],
      },
    }));
  }

  function clearFilters() {
    setFilters(defaultFilters);
  }

  async function forkAndOpen(result: MapSearchResultPayload) {
    if (!getStoredAuthToken()) {
      setError("Sign in before opening a public map as a world");
      setActionStatus("error");
      return;
    }
    setActionStatus("forking");
    setError(null);
    try {
      const forked = await forkMapProject(result.projectId);
      if (!forked.currentVersionId) {
        throw new Error("Forked map has no version");
      }
      const world = await createWorldInstance({
        mapVersionId: forked.currentVersionId,
        name: forked.title,
      });
      window.location.assign(`/world/${encodeURIComponent(world.worldInstance.id)}`);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Could not open public map");
      setActionStatus("error");
    }
  }

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>World Forge</p>
          <h1>Gallery</h1>
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

      <section className="gallery-shell" aria-label="Public map gallery">
        <form className="gallery-filter-panel" onSubmit={onSubmit}>
          <div className="gallery-filter-row primary">
            <label>
              <span>Keyword</span>
              <input type="search" value={filters.keyword} onChange={updateTextFilter("keyword")} />
            </label>
            <label>
              <span>Map type</span>
              <select value={filters.mapType} onChange={updateTextFilter("mapType")}>
                <option value="">Any</option>
                {mapTypeChoices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select value={filters.sort} onChange={updateSort}>
                {sortChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="generate-button" disabled={status === "loading"}>
              Search
            </button>
            <button type="button" className="secondary-button" onClick={clearFilters}>
              Reset
            </button>
          </div>

          <fieldset className="gallery-filter-group">
            <legend>Features</legend>
            <div className="gallery-checkbox-grid">
              {featureChoices.map((feature) => (
                <label key={feature} className="checkbox-row">
                  <input type="checkbox" checked={filters.features[feature]} onChange={() => toggleFeature(feature)} />
                  <span>{feature}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="gallery-filter-group">
            <legend>Algorithms</legend>
            <div className="gallery-filter-row">
              <label>
                <span>Terrain</span>
                <select value={filters.terrainAlgorithm} onChange={updateTextFilter("terrainAlgorithm")}>
                  <option value="">Any</option>
                  {terrainAlgorithms.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Cave</span>
                <select value={filters.caveAlgorithm} onChange={updateTextFilter("caveAlgorithm")}>
                  <option value="">Any</option>
                  {caveAlgorithms.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Road</span>
                <select value={filters.roadAlgorithm} onChange={updateTextFilter("roadAlgorithm")}>
                  <option value="">Any</option>
                  {roadAlgorithms.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="gallery-filter-group">
            <legend>Size</legend>
            <div className="gallery-filter-row compact">
              <NumberFilter label="Min width" value={filters.minWidth} onChange={updateTextFilter("minWidth")} />
              <NumberFilter label="Max width" value={filters.maxWidth} onChange={updateTextFilter("maxWidth")} />
              <NumberFilter label="Min height" value={filters.minHeight} onChange={updateTextFilter("minHeight")} />
              <NumberFilter label="Max height" value={filters.maxHeight} onChange={updateTextFilter("maxHeight")} />
            </div>
          </fieldset>

          <fieldset className="gallery-filter-group">
            <legend>Stats</legend>
            <div className="gallery-filter-row compact">
              <NumberFilter label="Min forest" value={filters.minForestRatio} step={0.05} onChange={updateTextFilter("minForestRatio")} />
              <NumberFilter label="Min mountain" value={filters.minMountainRatio} step={0.05} onChange={updateTextFilter("minMountainRatio")} />
              <NumberFilter label="Min water" value={filters.minWaterRatio} step={0.05} onChange={updateTextFilter("minWaterRatio")} />
              <NumberFilter label="Min land" value={filters.minLandRatio} step={0.05} onChange={updateTextFilter("minLandRatio")} />
            </div>
          </fieldset>

          <fieldset className="gallery-filter-group">
            <legend>Living stats</legend>
            <div className="gallery-filter-row compact">
              <NumberFilter label="Min creatures" value={filters.minCreatureCount} onChange={updateTextFilter("minCreatureCount")} />
              <NumberFilter label="Min reachable" value={filters.minReachableAreaRatio} step={0.05} onChange={updateTextFilter("minReachableAreaRatio")} />
              <NumberFilter label="Min portals" value={filters.minPortalCount} onChange={updateTextFilter("minPortalCount")} />
            </div>
          </fieldset>
        </form>

        {error ? <p className="error-line">{error}</p> : null}

        <div className="gallery-layout">
          <aside className="gallery-facets" aria-label="Search facets">
            <FacetSection title="Map type" buckets={facets?.mapTypes} />
            <FacetSection title="Features" buckets={facets?.features} />
            <FacetSection title="Terrain algorithms" buckets={facets?.terrainAlgorithms} />
            <FacetSection title="Cave algorithms" buckets={facets?.caveAlgorithms} />
            <FacetSection title="Road algorithms" buckets={facets?.roadAlgorithms} />
          </aside>

          <section className="gallery-results" aria-label="Search results">
            <div className="gallery-result-toolbar">
              <span className="status-pill">
                {status === "loading" ? "loading" : actionStatus === "forking" ? "forking" : `${results?.total ?? 0} maps`}
              </span>
              <span>{filterSummary(filters)}</span>
            </div>

            {status === "error" ? <div className="gallery-state">Search failed.</div> : null}
            {status === "loading" && !results ? <div className="gallery-state">Loading public maps...</div> : null}
            {status !== "loading" && results?.results.length === 0 ? <div className="gallery-state">No public maps match these filters.</div> : null}

            <div className="gallery-grid">
              {results?.results.map((result) => (
                <MapResultCard key={result.projectId} result={result} onOpen={() => void forkAndOpen(result)} busy={actionStatus === "forking"} />
              ))}
            </div>
          </section>

          {detailProjectId ? (
            <aside className="gallery-detail" aria-label="Map detail">
              <a className="text-link" href="/gallery">
                Back to gallery
              </a>
              {detailStatus === "loading" ? <div className="gallery-state">Loading map detail...</div> : null}
              {detailStatus === "error" ? <div className="gallery-state">Map detail is unavailable.</div> : null}
              {detail ? <MapDetail project={detail} /> : null}
            </aside>
          ) : null}
        </div>
      </section>
    </main>
  );
}

interface NumberFilterProps {
  label: string;
  value: string;
  step?: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function NumberFilter({ label, value, step = 1, onChange }: NumberFilterProps) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" min={0} step={step} value={value} onChange={onChange} />
    </label>
  );
}

function MapResultCard({ result, onOpen, busy }: { result: MapSearchResultPayload; onOpen: () => void; busy: boolean }) {
  return (
    <article className="gallery-card">
      <div className="gallery-thumbnail">
        {result.thumbnailUrl ? (
          <img src={result.thumbnailUrl} alt={`${result.title} thumbnail`} loading="lazy" />
        ) : (
          <div>
            <strong>{result.mapType}</strong>
            <span>{result.mapHash.slice(0, 10)}</span>
          </div>
        )}
      </div>
      <div className="gallery-card-body">
        <div>
          <h2>{result.title}</h2>
          <p>{result.description || result.mapType}</p>
        </div>
        <dl className="gallery-card-meta">
          <MetaItem label="Type" value={result.mapType} />
          <MetaItem label="Size" value={`${result.width} x ${result.height}`} />
          <MetaItem label="Owner" value={result.ownerNickname || "Unknown"} />
          <MetaItem label="Created" value={formatDate(result.createdAt)} />
        </dl>
        <ChipRow items={result.features} fallback="No features" />
        <div className="gallery-stat-row">
          <span>Forest {formatRatio(result.stats.forestRatio)}</span>
          <span>Mountain {formatRatio(result.stats.mountainRatio)}</span>
          <span>Water {formatRatio(result.stats.waterRatio)}</span>
          <span>Land {formatRatio(result.stats.landRatio)}</span>
        </div>
        <div className="gallery-stat-row">
          <span>Creatures {formatNumber(result.livingStats.creatureCount)}</span>
          <span>Reachable {formatRatio(result.livingStats.reachableAreaRatio)}</span>
          <span>Portals {formatNumber(result.livingStats.portalCount)}</span>
        </div>
      </div>
      <div className="gallery-card-actions">
        <a className="secondary-button text-button" href={`/maps/${encodeURIComponent(result.projectId)}`}>
          Details
        </a>
        <button type="button" className="generate-button" onClick={onOpen} disabled={busy}>
          Fork & Open
        </button>
      </div>
    </article>
  );
}

function MapDetail({ project }: { project: MapProjectPayload }) {
  const version = project.currentVersion;
  return (
    <div className="gallery-detail-panel">
      <h2>{project.title}</h2>
      <p>{project.description || "No description"}</p>
      <dl className="gallery-card-meta stacked">
        <MetaItem label="Map hash" value={version?.mapHash ?? "No version"} />
        <MetaItem label="Size" value={version ? `${version.width} x ${version.height}` : "No version"} />
        <MetaItem label="Engine" value={version?.engineVersion ?? "No version"} />
        <MetaItem label="Created" value={formatDate(project.createdAt)} />
      </dl>
      {version ? (
        <div className="gallery-stat-row vertical">
          <span>Forest {formatRatio(numberStat(version.stats, "forestRatio"))}</span>
          <span>Mountain {formatRatio(numberStat(version.stats, "mountainRatio"))}</span>
          <span>Water {formatRatio(numberStat(version.stats, "waterRatio"))}</span>
          <span>Land {formatRatio(numberStat(version.stats, "landRatio"))}</span>
        </div>
      ) : null}
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

function FacetSection({ title, buckets }: { title: string; buckets?: readonly FacetBucketPayload[] }) {
  const visibleBuckets = buckets?.slice(0, 8) ?? [];
  return (
    <section className="facet-section">
      <h2>{title}</h2>
      {visibleBuckets.length === 0 ? (
        <p>No values</p>
      ) : (
        <ul>
          {visibleBuckets.map((bucket) => (
            <li key={bucket.value}>
              <span>{bucket.value}</span>
              <strong>{bucket.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function buildSearchInput(filters: GalleryFilters): SearchMapsInput {
  return {
    keyword: emptyToUndefined(filters.keyword),
    mapType: emptyToUndefined(filters.mapType),
    features: selectedFeatures(filters.features),
    terrainAlgorithm: emptyToUndefined(filters.terrainAlgorithm),
    caveAlgorithm: emptyToUndefined(filters.caveAlgorithm),
    roadAlgorithm: emptyToUndefined(filters.roadAlgorithm),
    minWidth: numberOrUndefined(filters.minWidth),
    maxWidth: numberOrUndefined(filters.maxWidth),
    minHeight: numberOrUndefined(filters.minHeight),
    maxHeight: numberOrUndefined(filters.maxHeight),
    minForestRatio: numberOrUndefined(filters.minForestRatio),
    maxForestRatio: numberOrUndefined(filters.maxForestRatio),
    minMountainRatio: numberOrUndefined(filters.minMountainRatio),
    maxMountainRatio: numberOrUndefined(filters.maxMountainRatio),
    minWaterRatio: numberOrUndefined(filters.minWaterRatio),
    maxWaterRatio: numberOrUndefined(filters.maxWaterRatio),
    minLandRatio: numberOrUndefined(filters.minLandRatio),
    maxLandRatio: numberOrUndefined(filters.maxLandRatio),
    minCreatureCount: numberOrUndefined(filters.minCreatureCount),
    maxCreatureCount: numberOrUndefined(filters.maxCreatureCount),
    minReachableAreaRatio: numberOrUndefined(filters.minReachableAreaRatio),
    maxReachableAreaRatio: numberOrUndefined(filters.maxReachableAreaRatio),
    minPortalCount: numberOrUndefined(filters.minPortalCount),
    maxPortalCount: numberOrUndefined(filters.maxPortalCount),
    sort: filters.sort,
    size: 20,
  };
}

function selectedFeatures(features: Record<FeatureName, boolean>): string | undefined {
  const selected = featureChoices.filter((feature) => features[feature]);
  return selected.length === 0 ? undefined : selected.join(",");
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatRatio(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "-";
}

function formatNumber(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "0";
}

function numberStat(stats: Record<string, unknown>, key: string): number | undefined {
  const value = stats[key];
  return typeof value === "number" ? value : undefined;
}

function filterSummary(filters: GalleryFilters): string {
  const parts = [
    filters.mapType || "all types",
    selectedFeatures(filters.features) || "all features",
    filters.terrainAlgorithm || "any terrain",
  ];
  return parts.join(" / ");
}
