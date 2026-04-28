import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthStatus } from "../components/AuthStatus";
import {
  createWorldInstance,
  fetchSearchFacets,
  forkMapProject,
  getStoredAuthToken,
  searchMaps,
  type MapSearchFacetsPayload,
  type MapSearchPayload,
  type MapSearchResultPayload,
} from "../world/worldApi";

const featureChoices = ["mountains", "forests", "trees", "roads", "caves", "rivers", "villages"] as const;
const activityChoices = ["", "quiet", "inhabited", "dense"] as const;

export function SearchPage() {
  const [keyword, setKeyword] = useState("");
  const [feature, setFeature] = useState("");
  const [livingActivity, setLivingActivity] = useState("");
  const [minCreatureCount, setMinCreatureCount] = useState("");
  const [minReachableAreaRatio, setMinReachableAreaRatio] = useState("");
  const [results, setResults] = useState<MapSearchPayload | null>(null);
  const [facets, setFacets] = useState<MapSearchFacetsPayload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [actionStatus, setActionStatus] = useState<"idle" | "forking" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const nextResults = await searchMaps({
        keyword,
        features: feature,
        livingActivity,
        minCreatureCount: minCreatureCount === "" ? undefined : Number(minCreatureCount),
        minReachableAreaRatio: minReachableAreaRatio === "" ? undefined : Number(minReachableAreaRatio),
        size: 20,
      });
      setResults(nextResults);
      setStatus("idle");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Search failed");
      setStatus("error");
    }
  }, [feature, keyword, livingActivity, minCreatureCount, minReachableAreaRatio]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
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

  useEffect(() => {
    void fetchSearchFacets()
      .then(setFacets)
      .catch(() => setFacets(null));
    void searchMaps({ size: 20 })
      .then((nextResults) => {
        setResults(nextResults);
        setStatus("idle");
      })
      .catch((unknownError) => {
        setError(unknownError instanceof Error ? unknownError.message : "Search failed");
        setStatus("error");
      });
  }, []);

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>World Forge</p>
          <h1>Public Search</h1>
        </div>
        <nav className="top-nav" aria-label="Navigation">
          <a className="text-link" href="/editor">
            Editor
          </a>
          <a className="text-link" href="/maps">
            My Maps
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="search-shell" aria-label="Public map search">
        <form className="search-form" onSubmit={onSubmit}>
          <label>
            <span>Keyword</span>
            <input type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          </label>
          <label>
            <span>Feature</span>
            <select value={feature} onChange={(event) => setFeature(event.target.value)}>
              <option value="">Any</option>
              {featureChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Living</span>
            <select value={livingActivity} onChange={(event) => setLivingActivity(event.target.value)}>
              {activityChoices.map((choice) => (
                <option key={choice || "any"} value={choice}>
                  {choice || "Any"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Min Creatures</span>
            <input type="number" min={0} value={minCreatureCount} onChange={(event) => setMinCreatureCount(event.target.value)} />
          </label>
          <label>
            <span>Min Reachable</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={minReachableAreaRatio}
              onChange={(event) => setMinReachableAreaRatio(event.target.value)}
            />
          </label>
          <button type="submit" className="generate-button" disabled={status === "loading"}>
            Search
          </button>
        </form>

        {error ? <p className="error-line">{error}</p> : null}

        <div className="search-summary">
          <span className="status-pill">{status === "loading" ? "loading" : actionStatus === "forking" ? "forking" : `${results?.total ?? 0} maps`}</span>
          {facets ? (
            <div className="facet-row">
              {facets.features.slice(0, 5).map((bucket) => (
                <span key={bucket.value}>
                  {bucket.value} {bucket.count}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="map-list">
          {results?.results.map((result) => (
            <article key={result.projectId} className="map-list-item">
              <div>
                <h2>{result.title}</h2>
                <p>{result.description || result.mapType}</p>
                <code>{result.mapHash}</code>
              </div>
              <dl className="map-meta">
                <div>
                  <dt>Type</dt>
                  <dd>{result.mapType}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>
                    {result.width} x {result.height}
                  </dd>
                </div>
                <div>
                  <dt>Living</dt>
                  <dd>{result.livingActivity}</dd>
                </div>
                <div>
                  <dt>Creatures</dt>
                  <dd>{result.livingStats.creatureCount ?? 0}</dd>
                </div>
              </dl>
              <div className="map-actions">
                <button type="button" className="generate-button" onClick={() => void forkAndOpen(result)} disabled={actionStatus === "forking"}>
                  Fork & Open
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
