import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AuthStatus } from "../components/AuthStatus";
import { algorithmLabel, appName, featureLabel, formatKoreanDate, mapTypeLabel } from "../i18n/korean";
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
  { value: "newest", label: "새로 태어난 순" },
  { value: "popular", label: "많이 열린 순" },
  { value: "mostCreatures", label: "생명체 많은 순" },
  { value: "mostExplorable", label: "탐험지 넓은 순" },
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
      setError(unknownError instanceof Error ? unknownError.message : "공개 지도장을 뒤지지 못했습니다");
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
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!detailProjectId) {
        setDetail(null);
        setDetailStatus("idle");
        return;
      }
      setDetailStatus("loading");
      setError(null);
      void fetchMapProject(detailProjectId)
        .then((project) => {
          if (cancelled) {
            return;
          }
          setDetail(project);
          setDetailStatus("idle");
        })
        .catch((unknownError) => {
          if (cancelled) {
            return;
          }
          setDetail(null);
          setDetailStatus("error");
          setError(unknownError instanceof Error ? unknownError.message : "지도 상세 기록을 불러오지 못했습니다");
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
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

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>공개 탐험관</h1>
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
          <a className="text-link" href="/dashboard">
            내 세계
          </a>
          <a className="text-link" href="/gallery">
            탐험관
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="gallery-shell" aria-label="공개 지도 탐험관">
        <form className="gallery-filter-panel" onSubmit={onSubmit}>
          <div className="gallery-filter-row primary">
            <label>
              <span>검색어</span>
              <input type="search" value={filters.keyword} onChange={updateTextFilter("keyword")} />
            </label>
            <label>
              <span>지도 성격</span>
              <select value={filters.mapType} onChange={updateTextFilter("mapType")}>
                <option value="">전체</option>
                {mapTypeChoices.map((choice) => (
                  <option key={choice} value={choice}>
                    {mapTypeLabel(choice)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>정렬</span>
              <select value={filters.sort} onChange={updateSort}>
                {sortChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="generate-button" disabled={status === "loading"}>
              찾아보기
            </button>
            <button type="button" className="secondary-button" onClick={clearFilters}>
              초기화
            </button>
          </div>

          <fieldset className="gallery-filter-group">
            <legend>세계 요소</legend>
            <div className="gallery-checkbox-grid">
              {featureChoices.map((feature) => (
                <label key={feature} className="checkbox-row">
                  <input type="checkbox" checked={filters.features[feature]} onChange={() => toggleFeature(feature)} />
                  <span>{featureLabel(feature)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="gallery-filter-group">
            <legend>생성 알고리즘</legend>
            <div className="gallery-filter-row">
              <label>
                <span>지형 알고리즘</span>
                <select value={filters.terrainAlgorithm} onChange={updateTextFilter("terrainAlgorithm")}>
                  <option value="">전체</option>
                  {terrainAlgorithms.map((choice) => (
                    <option key={choice} value={choice}>
                      {algorithmLabel(choice)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>동굴 알고리즘</span>
                <select value={filters.caveAlgorithm} onChange={updateTextFilter("caveAlgorithm")}>
                  <option value="">전체</option>
                  {caveAlgorithms.map((choice) => (
                    <option key={choice} value={choice}>
                      {algorithmLabel(choice)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>도로 알고리즘</span>
                <select value={filters.roadAlgorithm} onChange={updateTextFilter("roadAlgorithm")}>
                  <option value="">전체</option>
                  {roadAlgorithms.map((choice) => (
                    <option key={choice} value={choice}>
                      {algorithmLabel(choice)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="gallery-filter-group">
            <legend>지도 크기</legend>
            <div className="gallery-filter-row compact">
              <NumberFilter label="최소 너비" value={filters.minWidth} onChange={updateTextFilter("minWidth")} />
              <NumberFilter label="최대 너비" value={filters.maxWidth} onChange={updateTextFilter("maxWidth")} />
              <NumberFilter label="최소 높이" value={filters.minHeight} onChange={updateTextFilter("minHeight")} />
              <NumberFilter label="최대 높이" value={filters.maxHeight} onChange={updateTextFilter("maxHeight")} />
            </div>
          </fieldset>

          <fieldset className="gallery-filter-group">
            <legend>지형 수치</legend>
            <div className="gallery-filter-row compact">
              <NumberFilter label="숲 최소" value={filters.minForestRatio} step={0.05} onChange={updateTextFilter("minForestRatio")} />
              <NumberFilter label="산악 최소" value={filters.minMountainRatio} step={0.05} onChange={updateTextFilter("minMountainRatio")} />
              <NumberFilter label="물 최소" value={filters.minWaterRatio} step={0.05} onChange={updateTextFilter("minWaterRatio")} />
              <NumberFilter label="육지 최소" value={filters.minLandRatio} step={0.05} onChange={updateTextFilter("minLandRatio")} />
            </div>
          </fieldset>

          <fieldset className="gallery-filter-group">
            <legend>살아 있는 세계</legend>
            <div className="gallery-filter-row compact">
              <NumberFilter label="생명체 최소" value={filters.minCreatureCount} onChange={updateTextFilter("minCreatureCount")} />
              <NumberFilter label="탐험 가능 최소" value={filters.minReachableAreaRatio} step={0.05} onChange={updateTextFilter("minReachableAreaRatio")} />
              <NumberFilter label="문 최소" value={filters.minPortalCount} onChange={updateTextFilter("minPortalCount")} />
            </div>
          </fieldset>
        </form>

        {error ? <p className="error-line">{error}</p> : null}

        <div className="gallery-layout">
          <aside className="gallery-facets" aria-label="검색 갈래">
            <FacetSection title="지도 성격" buckets={facets?.mapTypes} formatter={mapTypeLabel} />
            <FacetSection title="세계 요소" buckets={facets?.features} formatter={featureLabel} />
            <FacetSection title="지형 알고리즘" buckets={facets?.terrainAlgorithms} formatter={algorithmLabel} />
            <FacetSection title="동굴 알고리즘" buckets={facets?.caveAlgorithms} formatter={algorithmLabel} />
            <FacetSection title="도로 알고리즘" buckets={facets?.roadAlgorithms} formatter={algorithmLabel} />
          </aside>

          <section className="gallery-results" aria-label="검색 결과">
            <div className="gallery-result-toolbar">
              <span className="status-pill">
                {status === "loading" ? "불러오는 중" : actionStatus === "forking" ? "복제 중" : `${results?.total ?? 0}개 지도`}
              </span>
              <span>{filterSummary(filters)}</span>
            </div>

            {status === "error" ? <div className="gallery-state">탐험관 검색에 실패했습니다.</div> : null}
            {status === "loading" && !results ? <div className="gallery-state">공개 지도를 불러오는 중...</div> : null}
            {status !== "loading" && results?.results.length === 0 ? <div className="gallery-state">조건에 맞는 공개 지도가 없습니다.</div> : null}

            <div className="gallery-grid">
              {results?.results.map((result) => (
                <MapResultCard key={result.projectId} result={result} onOpen={() => void forkAndOpen(result)} busy={actionStatus === "forking"} />
              ))}
            </div>
          </section>

          {detailProjectId ? (
            <aside className="gallery-detail" aria-label="지도 상세">
              <a className="text-link" href="/gallery">
                탐험관으로 돌아가기
              </a>
              {detailStatus === "loading" ? <div className="gallery-state">지도 기록을 불러오는 중...</div> : null}
              {detailStatus === "error" ? <div className="gallery-state">지도 기록을 볼 수 없습니다.</div> : null}
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
            <strong>{mapTypeLabel(result.mapType)}</strong>
            <span>{result.mapHash.slice(0, 10)}</span>
          </div>
        )}
      </div>
      <div className="gallery-card-body">
        <div>
          <h2>{result.title}</h2>
          <p>{result.description || mapTypeLabel(result.mapType)}</p>
        </div>
        <dl className="gallery-card-meta">
          <MetaItem label="성격" value={mapTypeLabel(result.mapType)} />
          <MetaItem label="크기" value={`${result.width} x ${result.height}`} />
          <MetaItem label="기록자" value={result.ownerNickname || "알 수 없음"} />
          <MetaItem label="공개일" value={formatDate(result.createdAt)} />
        </dl>
        <ChipRow items={result.features.map(featureLabel)} fallback="표시된 요소 없음" />
        <div className="gallery-stat-row">
          <span>숲 {formatRatio(result.stats.forestRatio)}</span>
          <span>산악 {formatRatio(result.stats.mountainRatio)}</span>
          <span>물 {formatRatio(result.stats.waterRatio)}</span>
          <span>육지 {formatRatio(result.stats.landRatio)}</span>
        </div>
        <div className="gallery-stat-row">
          <span>생명체 {formatNumber(result.livingStats.creatureCount)}</span>
          <span>탐험 가능 {formatRatio(result.livingStats.reachableAreaRatio)}</span>
          <span>문 {formatNumber(result.livingStats.portalCount)}</span>
        </div>
      </div>
      <div className="gallery-card-actions">
        <a className="secondary-button text-button" href={`/maps/${encodeURIComponent(result.projectId)}`}>
          상세 기록
        </a>
        <button type="button" className="generate-button" onClick={onOpen} disabled={busy}>
          내 세계로 열기
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
      <p>{project.description || "아직 남긴 기록이 없습니다"}</p>
      <dl className="gallery-card-meta stacked">
        <MetaItem label="지도 인장값" value={version?.mapHash ?? "버전 없음"} />
        <MetaItem label="크기" value={version ? `${version.width} x ${version.height}` : "버전 없음"} />
        <MetaItem label="엔진" value={version?.engineVersion ?? "버전 없음"} />
        <MetaItem label="공개일" value={formatDate(project.createdAt)} />
      </dl>
      {version ? (
        <div className="gallery-stat-row vertical">
          <span>숲 {formatRatio(numberStat(version.stats, "forestRatio"))}</span>
          <span>산악 {formatRatio(numberStat(version.stats, "mountainRatio"))}</span>
          <span>물 {formatRatio(numberStat(version.stats, "waterRatio"))}</span>
          <span>육지 {formatRatio(numberStat(version.stats, "landRatio"))}</span>
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

function FacetSection({ title, buckets, formatter = (value: string) => value }: { title: string; buckets?: readonly FacetBucketPayload[]; formatter?: (value: string) => string }) {
  const visibleBuckets = buckets?.slice(0, 8) ?? [];
  return (
    <section className="facet-section">
      <h2>{title}</h2>
      {visibleBuckets.length === 0 ? (
        <p>아직 없음</p>
      ) : (
        <ul>
          {visibleBuckets.map((bucket) => (
            <li key={bucket.value}>
              <span>{formatter(bucket.value)}</span>
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
    return formatKoreanDate(value, false);
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
    filters.mapType ? mapTypeLabel(filters.mapType) : "모든 성격",
    selectedFeatures(filters.features)?.split(",").map(featureLabel).join(", ") || "모든 요소",
    filters.terrainAlgorithm ? algorithmLabel(filters.terrainAlgorithm) : "모든 지형 알고리즘",
  ];
  return parts.join(" / ");
}
