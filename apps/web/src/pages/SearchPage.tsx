import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthStatus } from "../components/AuthStatus";
import { appName, featureLabel, mapTypeLabel } from "../i18n/korean";
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
const activityLabels: Record<string, string> = {
  quiet: "고요함",
  inhabited: "살아 있음",
  dense: "북적임",
};

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
      setError(unknownError instanceof Error ? unknownError.message : "공개 지도를 찾지 못했습니다");
      setStatus("error");
    }
  }, [feature, keyword, livingActivity, minCreatureCount, minReachableAreaRatio]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
  }

  async function forkAndOpen(result: MapSearchResultPayload) {
    if (!getStoredAuthToken()) {
      setError("공개 지도를 세계로 열려면 먼저 로그인해주세요");
      setActionStatus("error");
      return;
    }
    setActionStatus("forking");
    setError(null);
    try {
      const forked = await forkMapProject(result.projectId);
      if (!forked.currentVersionId) {
        throw new Error("복제한 지도에 버전이 없습니다");
      }
      const world = await createWorldInstance({
        mapVersionId: forked.currentVersionId,
        name: forked.title,
      });
      window.location.assign(`/world/${encodeURIComponent(world.worldInstance.id)}`);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "공개 지도를 열지 못했습니다");
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
        setError(unknownError instanceof Error ? unknownError.message : "공개 지도를 찾지 못했습니다");
        setStatus("error");
      });
  }, []);

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>공개 지도 검색</h1>
        </div>
        <nav className="top-nav" aria-label="이동">
          <a className="text-link" href="/editor">
            창조실
          </a>
          <a className="text-link" href="/maps">
            내 지도
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="search-shell" aria-label="공개 지도 검색">
        <form className="search-form" onSubmit={onSubmit}>
          <label>
            <span>검색어</span>
            <input type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          </label>
          <label>
            <span>세계 요소</span>
            <select value={feature} onChange={(event) => setFeature(event.target.value)}>
              <option value="">전체</option>
              {featureChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {featureLabel(choice)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>생활감</span>
            <select value={livingActivity} onChange={(event) => setLivingActivity(event.target.value)}>
              {activityChoices.map((choice) => (
                <option key={choice || "any"} value={choice}>
                  {choice ? activityLabels[choice] : "전체"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>생명체 최소</span>
            <input type="number" min={0} value={minCreatureCount} onChange={(event) => setMinCreatureCount(event.target.value)} />
          </label>
          <label>
            <span>탐험 가능 최소</span>
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
            찾아보기
          </button>
        </form>

        {error ? <p className="error-line">{error}</p> : null}

        <div className="search-summary">
          <span className="status-pill">{status === "loading" ? "불러오는 중" : actionStatus === "forking" ? "복제 중" : `${results?.total ?? 0}개 지도`}</span>
          {facets ? (
            <div className="facet-row">
              {facets.features.slice(0, 5).map((bucket) => (
                <span key={bucket.value}>
                  {featureLabel(bucket.value)} {bucket.count}
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
                <p>{result.description || mapTypeLabel(result.mapType)}</p>
                <code>{result.mapHash}</code>
              </div>
              <dl className="map-meta">
                <div>
                  <dt>성격</dt>
                  <dd>{mapTypeLabel(result.mapType)}</dd>
                </div>
                <div>
                  <dt>크기</dt>
                  <dd>
                    {result.width} x {result.height}
                  </dd>
                </div>
                <div>
                  <dt>생활감</dt>
                  <dd>{result.livingActivity}</dd>
                </div>
                <div>
                  <dt>생명체</dt>
                  <dd>{result.livingStats.creatureCount ?? 0}</dd>
                </div>
              </dl>
              <div className="map-actions">
                <button type="button" className="generate-button" onClick={() => void forkAndOpen(result)} disabled={actionStatus === "forking"}>
                  내 세계로 열기
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
