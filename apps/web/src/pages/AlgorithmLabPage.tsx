import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  validateGenerationRecipe,
  type AlgorithmSelection,
  type GenerationRecipe,
  type MapData,
  type TerrainType,
} from "@world-forge/shared";
import { AuthStatus } from "../components/AuthStatus";
import { createEditorEngine, type EditorEngine, type EditorEngineRuntime } from "../editor/engineAdapter";
import { algorithmOptions, cloneRecipe, formatPercent, sizeOptions, withMapSize, withSeed } from "../editor/editorState";
import { samplePresetById, sampleWorldPresets } from "../editor/sampleWorlds";
import { algorithmLabel, appName, metricLabel, statusLabel } from "../i18n/korean";

type AlgorithmCategory = keyof AlgorithmSelection;
type PreviewMode = "auto" | "all" | "surface" | "cave" | "road" | "objectPlacement" | "difference";

export interface ComparisonTuning {
  caveDensity: number;
  roadComplexity: number;
  objectDensity: number;
}

interface ComparisonResult {
  side: "left" | "right";
  label: string;
  recipe: GenerationRecipe;
  mapData: MapData;
}

export interface MapDifferenceSummary {
  changedTiles: number;
  changedRatio: number;
  terrainChanged: number;
  heightChanged: number;
  collisionChanged: number;
  costChanged: number;
  objectChanged: number;
}

const defaultComparisonTuning: ComparisonTuning = {
  caveDensity: 0.68,
  roadComplexity: 0.96,
  objectDensity: 0.9,
};

const categoryLabels: Record<AlgorithmCategory, string> = {
  terrain: "지형 알고리즘",
  cave: "동굴 알고리즘",
  road: "도로 알고리즘",
  objectPlacement: "오브젝트 배치 알고리즘",
};

const previewModeOptions: readonly { value: PreviewMode; label: string }[] = [
  { value: "auto", label: "자동 강조" },
  { value: "all", label: "전체 비교" },
  { value: "surface", label: "대지" },
  { value: "cave", label: "동굴" },
  { value: "road", label: "도로" },
  { value: "objectPlacement", label: "오브젝트" },
  { value: "difference", label: "차이 히트맵" },
];

const initialRuntime: EditorEngineRuntime = {
  kind: "wasm",
  label: "WASM",
  detail: "/wasm/world_forge_engine.wasm",
};

async function generateWithTiming(
  engine: EditorEngine,
  recipe: GenerationRecipe,
): Promise<{ mapData: MapData; generationMs: number }> {
  const startedAt = performance.now();
  const mapData = await engine.generate(recipe);
  return { mapData, generationMs: performance.now() - startedAt };
}

function withMeasuredGenerationTime(mapData: MapData, generationMs: number): MapData {
  return {
    ...mapData,
    stats: {
      ...mapData.stats,
      generationTimeMs: Math.max(0, Math.round(generationMs)),
    },
  };
}

export function AlgorithmLabPage() {
  const initialPreset = sampleWorldPresets[0];
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [seed, setSeed] = useState(initialPreset.recipe.seed);
  const [size, setSize] = useState(initialPreset.recipe.width);
  const [leftAlgorithms, setLeftAlgorithms] = useState<AlgorithmSelection>(() => ({ ...initialPreset.recipe.algorithms }));
  const [rightAlgorithms, setRightAlgorithms] = useState<AlgorithmSelection>(() => contrastAlgorithms(initialPreset.recipe.algorithms));
  const [previewMode, setPreviewMode] = useState<PreviewMode>("auto");
  const [comparisonTuning, setComparisonTuning] = useState<ComparisonTuning>(defaultComparisonTuning);
  const [results, setResults] = useState<ComparisonResult[] | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [engineRuntime, setEngineRuntime] = useState<EditorEngineRuntime>(initialRuntime);
  const engineRef = useRef<EditorEngine | null>(null);
  const generatedOnceRef = useRef(false);

  const changedCategories = useMemo(
    () => changedAlgorithmCategories(leftAlgorithms, rightAlgorithms),
    [leftAlgorithms, rightAlgorithms],
  );
  const activePreviewMode = resolveComparisonPreviewMode(previewMode, changedCategories);

  const getEngine = useCallback(() => {
    engineRef.current ??= createEditorEngine({
      onRuntimeChange: setEngineRuntime,
    });
    return engineRef.current;
  }, []);

  const buildBaseRecipe = useCallback((): GenerationRecipe => {
    const preset = samplePresetById(presetId);
    return withSeed(withMapSize(cloneRecipe(preset.recipe), size, size), seed);
  }, [presetId, seed, size]);

  const generateComparison = useCallback(async () => {
    setStatus("generating");
    setError(null);
    try {
      const engine = getEngine();
      const baseRecipe = buildBaseRecipe();
      const leftRecipe = validateRecipe(prepareSideBySideRecipe(baseRecipe, leftAlgorithms, comparisonTuning));
      const rightRecipe = validateRecipe(prepareSideBySideRecipe(baseRecipe, rightAlgorithms, comparisonTuning));
      const [leftRun, rightRun] = await Promise.all([generateWithTiming(engine, leftRecipe), generateWithTiming(engine, rightRecipe)]);
      const leftMap = withMeasuredGenerationTime(leftRun.mapData, leftRun.generationMs);
      const rightMap = withMeasuredGenerationTime(rightRun.mapData, rightRun.generationMs);

      setResults([
        { side: "left", label: "왼쪽 설계", recipe: leftRecipe, mapData: leftMap },
        { side: "right", label: "오른쪽 설계", recipe: rightRecipe, mapData: rightMap },
      ]);
      setEngineRuntime(engine.runtime());
      setStatus("ready");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "알고리즘 비교를 생성하지 못했습니다");
      setStatus("error");
    }
  }, [buildBaseRecipe, comparisonTuning, getEngine, leftAlgorithms, rightAlgorithms]);

  useEffect(() => {
    if (generatedOnceRef.current) {
      return;
    }
    generatedOnceRef.current = true;
    void generateComparison();
  }, [generateComparison]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  function onPresetChange(event: ChangeEvent<HTMLSelectElement>) {
    const preset = samplePresetById(event.target.value);
    setPresetId(preset.id);
    setSeed(preset.recipe.seed);
    setSize(preset.recipe.width);
    setLeftAlgorithms({ ...preset.recipe.algorithms });
    setRightAlgorithms(contrastAlgorithms(preset.recipe.algorithms));
  }

  return (
    <main className="editor-shell algorithm-lab-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>알고리즘 비교실</h1>
        </div>
        <div className={`engine-runtime ${engineRuntime.kind}`}>
          <span>엔진</span>
          <strong>{engineRuntime.label}</strong>
          <small>{engineRuntime.detail}</small>
        </div>
        <nav className="top-nav" aria-label="이동">
          <a className="text-link" href="/portfolio">
            포트폴리오
          </a>
          <a className="text-link" href="/editor">
            창조실
          </a>
          <a className="text-link" href="/determinism">
            결정성 검증
          </a>
          <a className="text-link" href="/gallery">
            탐험관
          </a>
          <a className="text-link" href="/dashboard">
            내 세계
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="algorithm-lab">
        <div className="algorithm-lab-intro">
          <div>
            <span className="stat-label">Left recipe vs right recipe</span>
            <h2>왼쪽과 오른쪽 설계의 알고리즘 조합을 직접 비교합니다</h2>
            <p>
              각 설계에서 지형, 동굴, 도로, 오브젝트 배치 알고리즘을 따로 고를 수 있습니다. 동굴 비교는 보라색 방/터널
              구조, 도로 비교는 노란 경로, 오브젝트 비교는 배치 표식을 중심으로 보세요.
            </p>
          </div>
          <span className="status-pill">{statusLabel(status)}</span>
        </div>

        <div className="algorithm-lab-controls algorithm-compare-controls">
          <label>
            <span>샘플 세계</span>
            <select value={presetId} onChange={onPresetChange}>
              {sampleWorldPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>시드</span>
            <input type="number" min={0} max={4294967295} value={seed} onChange={(event) => setSeed(Number(event.target.value))} />
          </label>
          <label>
            <span>크기</span>
            <select value={size} onChange={(event) => setSize(Number(event.target.value))}>
              {sizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} x {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>미리보기 초점</span>
            <select value={previewMode} onChange={(event) => setPreviewMode(event.target.value as PreviewMode)}>
              {previewModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="generate-button" onClick={() => void generateComparison()} disabled={status === "generating"}>
            {status === "generating" ? "비교 생성 중" : "좌우 비교 생성"}
          </button>
        </div>

        <div className="algorithm-tuning-controls" aria-label="비교실 생성 강도">
          <div>
            <span className="stat-label">비교용 생성 강도</span>
            <p>비교실에서는 알고리즘 차이가 보이도록 feature를 켜고 아래 강도로 recipe를 보정합니다.</p>
          </div>
          <TuningSlider
            label="동굴 표시량"
            value={comparisonTuning.caveDensity}
            onChange={(value) => setComparisonTuning((current) => ({ ...current, caveDensity: value }))}
          />
          <TuningSlider
            label="도로 표시량"
            value={comparisonTuning.roadComplexity}
            onChange={(value) => setComparisonTuning((current) => ({ ...current, roadComplexity: value }))}
          />
          <TuningSlider
            label="오브젝트 표시량"
            value={comparisonTuning.objectDensity}
            onChange={(value) => setComparisonTuning((current) => ({ ...current, objectDensity: value }))}
          />
        </div>

        <div className="algorithm-side-controls">
          <AlgorithmSideControls
            label="왼쪽 설계"
            algorithms={leftAlgorithms}
            peerAlgorithms={rightAlgorithms}
            onChange={setLeftAlgorithms}
          />
          <AlgorithmSideControls
            label="오른쪽 설계"
            algorithms={rightAlgorithms}
            peerAlgorithms={leftAlgorithms}
            onChange={setRightAlgorithms}
          />
        </div>

        <div className="algorithm-focus-summary">
          <strong>현재 강조:</strong>
          <span>{previewModeLabel(activePreviewMode)}</span>
          <small>{previewSummary(activePreviewMode, changedCategories)}</small>
        </div>

        {error ? <p className="error-line">{error}</p> : null}

        <div className="algorithm-comparison-grid two-up">
          {results?.map((result) => (
            <ComparisonCard
              key={result.side}
              result={result}
              peerMapData={results.find((candidate) => candidate.side !== result.side)?.mapData}
              peerAlgorithms={result.side === "left" ? rightAlgorithms : leftAlgorithms}
              previewMode={activePreviewMode}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function TuningSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="algorithm-tuning-slider">
      <span>
        {label}
        <strong>{value.toFixed(2)}</strong>
      </span>
      <input type="range" min={0.1} max={1} step={0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function AlgorithmSideControls({
  label,
  algorithms,
  peerAlgorithms,
  onChange,
}: {
  label: string;
  algorithms: AlgorithmSelection;
  peerAlgorithms: AlgorithmSelection;
  onChange: (nextAlgorithms: AlgorithmSelection) => void;
}) {
  return (
    <section className="algorithm-side-panel" aria-label={`${label} 알고리즘 선택`}>
      <div className="algorithm-side-heading">
        <h2>{label}</h2>
        <span>{changedAlgorithmCategories(algorithms, peerAlgorithms).length}개 차이</span>
      </div>
      <div className="algorithm-side-selects">
        {(Object.keys(categoryLabels) as AlgorithmCategory[]).map((category) => (
          <label key={category} className={algorithms[category] !== peerAlgorithms[category] ? "changed" : ""}>
            <span>{categoryLabels[category]}</span>
            <select
              value={algorithms[category]}
              onChange={(event) => onChange({ ...algorithms, [category]: event.target.value } as AlgorithmSelection)}
            >
              {algorithmOptions[category].map((option) => (
                <option key={option} value={option}>
                  {algorithmLabel(option)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

function ComparisonCard({
  result,
  peerMapData,
  peerAlgorithms,
  previewMode,
}: {
  result: ComparisonResult;
  peerMapData?: MapData;
  peerAlgorithms: AlgorithmSelection;
  previewMode: Exclude<PreviewMode, "auto">;
}) {
  const { mapData } = result;
  const differenceSummary = peerMapData ? calculateMapDifferenceSummary(mapData, peerMapData) : null;
  const isInferredCavePreview = previewMode === "cave" && !hasCaveFootprint(mapData);
  const roadLength = Math.round(mapData.stats.roadLength ?? 0);
  const visibleObjects = mapData.objectList.filter((object) => object.layerId === "surface" && object.type !== "road-node").length;
  return (
    <article className={`algorithm-card ${result.side}`}>
      <div className="algorithm-card-heading">
        <div>
          <span>{result.label}</span>
          <h2>{algorithmCombinationTitle(result.recipe.algorithms, peerAlgorithms)}</h2>
        </div>
        <code>{mapData.mapHash.slice(0, 12)}</code>
      </div>
      <div className="algorithm-preview">
        <AlgorithmPreviewMap mapData={mapData} peerMapData={peerMapData} recipe={result.recipe} mode={previewMode} />
      </div>
      <p className="algorithm-preview-note">{previewNote(previewMode)}</p>
      {isInferredCavePreview ? (
        <p className="algorithm-warning-note">
          현재 로드된 WASM 산출물이 동굴 바닥/벽 타일을 내보내지 않아, 포털 위치와 선택한 동굴 알고리즘을 기준으로
          비교용 예상 구조를 표시합니다. 실제 동굴 타일 반영은 WASM 재빌드 후 확인하세요.
        </p>
      ) : null}
      {previewMode === "all" ? (
        <p className="algorithm-preview-note strong">
          이 보기에서는 지형 위에 동굴은 보라색, 도로는 노란 선, 오브젝트는 큰 심볼로 동시에 표시합니다.
        </p>
      ) : null}
      {roadLength === 0 || visibleObjects === 0 ? (
        <p className="algorithm-warning-note">
          현재 결과에서 {roadLength === 0 ? "도로 타일" : ""}{roadLength === 0 && visibleObjects === 0 ? "과 " : ""}
          {visibleObjects === 0 ? "표시 가능한 오브젝트" : ""}가 없습니다. feature 토글 또는 밀도 파라미터를 확인하세요.
        </p>
      ) : null}
      <p className="algorithm-difference-note">{algorithmDifferenceNote(result.recipe.algorithms, peerAlgorithms)}</p>
      <dl className="algorithm-metrics">
        <Metric label="생성 시간" value={`${Math.round(mapData.stats.generationTimeMs)}ms`} />
        <Metric label="차이 타일" value={differenceSummary ? formatPercent(differenceSummary.changedRatio) : "-"} />
        <Metric label="차이 유형" value={differenceSummary ? differenceTypeSummary(differenceSummary) : "-"} />
        <Metric label="동굴 타일" value={String(caveTileCount(mapData).toLocaleString("ko-KR"))} />
        <Metric label="도로" value={String(roadLength)} />
        <Metric label="나무/바위/마을" value={objectTypeSummary(mapData)} />
        <Metric label="물" value={formatPercent(mapData.stats.waterRatio)} />
        <Metric label="숲" value={formatPercent(mapData.stats.forestRatio)} />
        <Metric label="산악" value={formatPercent(mapData.stats.mountainRatio)} />
      </dl>
      <div className="algorithm-recipe-line">
        <span className="algorithm-impact-line">비교실 보정: 동굴/도로/나무/정착지 feature를 켜고 밀도를 보정합니다</span>
        {(Object.keys(categoryLabels) as AlgorithmCategory[]).map((category) => (
          <span key={category} className={result.recipe.algorithms[category] !== peerAlgorithms[category] ? "algorithm-changed" : ""}>
            {metricLabel(category)}: {algorithmLabel(result.recipe.algorithms[category])}
          </span>
        ))}
      </div>
    </article>
  );
}

const previewTerrainColors: Record<TerrainType, readonly [number, number, number]> = {
  "deep-water": [27, 72, 118],
  water: [49, 116, 168],
  sand: [213, 190, 128],
  grass: [107, 150, 84],
  forest: [50, 102, 63],
  mountain: [124, 121, 111],
  road: [150, 124, 82],
  "cave-floor": [126, 87, 150],
  "cave-wall": [51, 33, 67],
};

function AlgorithmPreviewMap({
  mapData,
  peerMapData,
  recipe,
  mode,
}: {
  mapData: MapData;
  peerMapData?: MapData;
  recipe: GenerationRecipe;
  mode: Exclude<PreviewMode, "auto">;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    drawAlgorithmPreview(canvas, mapData, recipe, mode, peerMapData);
  }, [mode, mapData, peerMapData, recipe]);

  return <canvas ref={canvasRef} className="map-canvas pixelated" aria-label={`${previewModeLabel(mode)} 비교 지도`} />;
}

function drawAlgorithmPreview(
  canvas: HTMLCanvasElement,
  mapData: MapData,
  recipe: GenerationRecipe,
  mode: Exclude<PreviewMode, "auto">,
  peerMapData?: MapData,
): void {
  canvas.width = mapData.width;
  canvas.height = mapData.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.imageSmoothingEnabled = false;
  const image = context.createImageData(mapData.width, mapData.height);
  const dimBase = mode !== "surface";

  for (let index = 0; index < mapData.terrainMap.length; index += 1) {
    const terrain = mapData.terrainMap[index];
    const color = colorForPreviewTerrain(terrain, mode, dimBase);
    const offset = index * 4;
    image.data[offset] = color[0];
    image.data[offset + 1] = color[1];
    image.data[offset + 2] = color[2];
    image.data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);

  if (mode === "difference") {
    drawDifferenceHeatmap(context, mapData, peerMapData);
    return;
  }

  if (mode === "all") {
    drawCaveFootprintOverlay(context, mapData, recipe, { muted: true });
    drawRoadOverlay(context, mapData);
    drawObjectOverlay(context, mapData, recipe);
  } else if (mode === "cave") {
    drawCaveFootprintOverlay(context, mapData, recipe);
  } else if (mode === "road") {
    drawRoadOverlay(context, mapData);
  } else if (mode === "objectPlacement") {
    drawObjectOverlay(context, mapData, recipe);
  }
}

function colorForPreviewTerrain(
  terrain: TerrainType,
  mode: Exclude<PreviewMode, "auto">,
  dimBase: boolean,
): readonly [number, number, number] {
  if (mode === "cave" || mode === "all") {
    if (terrain === "cave-floor") {
      return [174, 113, 214];
    }
    if (terrain === "cave-wall") {
      return [54, 31, 78];
    }
  }
  if ((mode === "road" || mode === "all") && terrain === "road") {
    return [245, 201, 82];
  }
  const color = mode === "cave" || mode === "all" ? cavePreviewBaseColor(terrain) : previewTerrainColors[terrain];
  return dimBase ? [Math.round(color[0] * 0.68), Math.round(color[1] * 0.68), Math.round(color[2] * 0.68)] : color;
}

function cavePreviewBaseColor(terrain: TerrainType): readonly [number, number, number] {
  if (terrain === "deep-water") {
    return [34, 67, 93];
  }
  if (terrain === "water") {
    return [54, 93, 114];
  }
  if (terrain === "sand") {
    return [135, 124, 90];
  }
  if (terrain === "forest") {
    return [49, 75, 50];
  }
  if (terrain === "mountain") {
    return [82, 80, 70];
  }
  if (terrain === "road") {
    return [94, 84, 59];
  }
  return [79, 96, 69];
}

function drawDifferenceHeatmap(
  context: CanvasRenderingContext2D,
  mapData: MapData,
  peerMapData?: MapData,
): void {
  if (!peerMapData || peerMapData.width !== mapData.width || peerMapData.height !== mapData.height) {
    return;
  }

  const objectDiffTiles = objectDifferenceTileIndexes(mapData, peerMapData);
  context.save();
  for (let index = 0; index < mapData.terrainMap.length; index += 1) {
    const x = index % mapData.width;
    const y = Math.floor(index / mapData.width);
    const terrainChanged = mapData.terrainMap[index] !== peerMapData.terrainMap[index];
    const collisionChanged = mapData.collisionMap[index] !== peerMapData.collisionMap[index];
    const costChanged = Math.abs((mapData.costMap[index] ?? 0) - (peerMapData.costMap[index] ?? 0)) >= 2;
    const heightDelta = Math.abs((mapData.heightMap[index] ?? 0) - (peerMapData.heightMap[index] ?? 0));
    const objectChanged = objectDiffTiles.has(index);

    if (terrainChanged || collisionChanged || objectChanged) {
      context.fillStyle = collisionChanged
        ? "rgba(190, 112, 255, 0.76)"
        : objectChanged
          ? "rgba(255, 225, 95, 0.78)"
          : "rgba(255, 116, 86, 0.66)";
      context.fillRect(x, y, 1, 1);
      continue;
    }

    if (heightDelta > 0.035 || costChanged) {
      const opacity = Math.min(0.68, Math.max(0.22, heightDelta * 2.8));
      context.fillStyle = costChanged ? `rgba(80, 180, 255, ${opacity})` : `rgba(255, 255, 255, ${opacity})`;
      context.fillRect(x, y, 1, 1);
    }
  }
  context.restore();
}

function drawCaveFootprintOverlay(
  context: CanvasRenderingContext2D,
  mapData: MapData,
  recipe: GenerationRecipe,
  options: { muted?: boolean } = {},
): void {
  context.save();
  const floorOpacity = options.muted ? 0.6 : 0.96;
  const wallOpacity = options.muted ? 0.7 : 0.98;
  if (hasCaveFootprint(mapData)) {
    for (let index = 0; index < mapData.terrainMap.length; index += 1) {
      const terrain = mapData.terrainMap[index];
      if (terrain !== "cave-floor" && terrain !== "cave-wall") {
        continue;
      }
      const x = index % mapData.width;
      const y = Math.floor(index / mapData.width);
      context.fillStyle = terrain === "cave-floor" ? `rgba(215, 139, 255, ${floorOpacity})` : `rgba(34, 17, 52, ${wallOpacity})`;
      context.fillRect(x, y, 1, 1);
    }
  } else {
    drawInferredCaveStructure(context, mapData, recipe);
  }
  const portals = mapData.portalList.filter((portal) => portal.fromLayerId === "surface");
  context.fillStyle = "#ffe15f";
  context.strokeStyle = "#2f174a";
  context.lineWidth = 1;
  for (const portal of portals) {
    drawTileDiamond(context, portal.x + 0.5, portal.y + 0.5, 2.2);
  }
  context.restore();
}

function drawInferredCaveStructure(context: CanvasRenderingContext2D, mapData: MapData, recipe: GenerationRecipe): void {
  const centers = cavePreviewCenters(mapData);
  if (recipe.algorithms.cave === "random-walk") {
    drawInferredRandomWalkCaves(context, mapData, recipe, centers);
  } else {
    drawInferredCellularCaves(context, mapData, recipe, centers);
  }
}

function cavePreviewCenters(mapData: MapData): { x: number; y: number }[] {
  const portalCenters = mapData.portalList
    .filter((portal) => portal.fromLayerId === "surface")
    .slice(0, 4)
    .map((portal) => ({ x: portal.x, y: portal.y }));
  if (portalCenters.length > 0) {
    return portalCenters;
  }
  const entranceCenters = mapData.objectList
    .filter((object) => object.type === "cave-entrance" && object.layerId === "surface")
    .slice(0, 4)
    .map((object) => ({ x: object.x, y: object.y }));
  if (entranceCenters.length > 0) {
    return entranceCenters;
  }
  return [{ x: Math.floor(mapData.width / 2), y: Math.floor(mapData.height / 2) }];
}

function drawInferredCellularCaves(
  context: CanvasRenderingContext2D,
  mapData: MapData,
  recipe: GenerationRecipe,
  centers: readonly { x: number; y: number }[],
): void {
  const chamberRadius = Math.max(8, Math.round(Math.min(mapData.width, mapData.height) * (0.1 + recipe.params.caveDensity * 0.035)));
  context.fillStyle = "rgba(38, 18, 56, 0.9)";
  for (const center of centers) {
    for (let y = center.y - chamberRadius - 3; y <= center.y + chamberRadius + 3; y += 1) {
      for (let x = center.x - chamberRadius - 3; x <= center.x + chamberRadius + 3; x += 1) {
        if (!isInsideMap(mapData, x, y)) {
          continue;
        }
        const distance = normalizedEllipseDistance(center, x, y, chamberRadius * 1.28, chamberRadius * 0.92);
        const edgeNoise = previewNoise(recipe.seed, x, y, 11) * 0.34;
        if (distance > 0.92 + edgeNoise && distance < 1.22 + edgeNoise) {
          context.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  context.fillStyle = "rgba(220, 142, 255, 0.96)";
  for (const center of centers) {
    for (let y = center.y - chamberRadius; y <= center.y + chamberRadius; y += 1) {
      for (let x = center.x - chamberRadius; x <= center.x + chamberRadius; x += 1) {
        if (!isInsideMap(mapData, x, y)) {
          continue;
        }
        const distance = normalizedEllipseDistance(center, x, y, chamberRadius * 1.18, chamberRadius * 0.84);
        const lumpyEdge = previewNoise(recipe.seed, x, y, 17) * 0.32;
        if (distance <= 0.82 + lumpyEdge) {
          context.fillRect(x, y, 1, 1);
        }
      }
    }
  }
}

function drawInferredRandomWalkCaves(
  context: CanvasRenderingContext2D,
  mapData: MapData,
  recipe: GenerationRecipe,
  centers: readonly { x: number; y: number }[],
): void {
  const steps = Math.max(72, Math.round(Math.min(mapData.width, mapData.height) * (0.72 + recipe.params.caveDensity * 0.35)));
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const [centerIndex, center] of centers.entries()) {
    const path = randomWalkPreviewPath(mapData, recipe, center, steps, centerIndex);
    context.strokeStyle = "rgba(37, 18, 54, 0.92)";
    context.lineWidth = 6;
    drawPreviewPath(context, path);
    context.strokeStyle = "rgba(220, 142, 255, 0.96)";
    context.lineWidth = 3.2;
    drawPreviewPath(context, path);
    context.fillStyle = "rgba(236, 186, 255, 0.96)";
    for (let index = 0; index < path.length; index += 18) {
      const point = path[index];
      drawTileCircle(context, point.x, point.y, 2.6);
    }
  }
}

function randomWalkPreviewPath(
  mapData: MapData,
  recipe: GenerationRecipe,
  start: { x: number; y: number },
  steps: number,
  salt: number,
): { x: number; y: number }[] {
  const points = [{ x: start.x + 0.5, y: start.y + 0.5 }];
  let x = start.x;
  let y = start.y;
  let direction = Math.floor(previewNoise(recipe.seed, x, y, 31 + salt) * 4);
  for (let step = 0; step < steps; step += 1) {
    const turnRoll = previewNoise(recipe.seed, x + step, y - step, 43 + salt);
    if (turnRoll > 0.72) {
      direction = (direction + 1) % 4;
    } else if (turnRoll < 0.18) {
      direction = (direction + 3) % 4;
    }
    const next = stepDirection(x, y, direction);
    x = clamp(next.x, 4, mapData.width - 5);
    y = clamp(next.y, 4, mapData.height - 5);
    points.push({ x: x + 0.5, y: y + 0.5 });
  }
  return points;
}

function drawPreviewPath(context: CanvasRenderingContext2D, path: readonly { x: number; y: number }[]): void {
  if (path.length < 2) {
    return;
  }
  context.beginPath();
  context.moveTo(path[0].x, path[0].y);
  for (const point of path.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.stroke();
}

function drawRoadOverlay(context: CanvasRenderingContext2D, mapData: MapData): void {
  context.save();
  context.fillStyle = "rgba(82, 55, 22, 0.68)";
  for (let index = 0; index < mapData.terrainMap.length; index += 1) {
    if (mapData.terrainMap[index] !== "road") {
      continue;
    }
    const x = index % mapData.width;
    const y = Math.floor(index / mapData.width);
    context.fillRect(x - 0.65, y - 0.65, 2.3, 2.3);
  }
  context.fillStyle = "rgba(255, 218, 74, 0.98)";
  for (let index = 0; index < mapData.terrainMap.length; index += 1) {
    if (mapData.terrainMap[index] !== "road") {
      continue;
    }
    const x = index % mapData.width;
    const y = Math.floor(index / mapData.width);
    context.fillRect(x - 0.25, y - 0.25, 1.5, 1.5);
  }
  context.restore();
}

function drawObjectOverlay(context: CanvasRenderingContext2D, mapData: MapData, recipe: GenerationRecipe): void {
  context.save();
  drawObjectPlacementField(context, mapData, recipe);
  for (const object of mapData.objectList) {
    if (object.layerId !== "surface" || object.type === "road-node") {
      continue;
    }
    context.strokeStyle = "#17221e";
    context.lineWidth = 0.9;
    if (object.type === "tree") {
      context.fillStyle = "#1f6a35";
      drawTileCircle(context, object.x + 0.5, object.y + 0.5, 2.4);
    } else if (object.type === "cave-entrance") {
      context.fillStyle = "#8e61c5";
      drawTileDiamond(context, object.x + 0.5, object.y + 0.5, 2.8);
    } else if (object.type === "rock") {
      context.fillStyle = "#d8d2bd";
      drawTileDiamond(context, object.x + 0.5, object.y + 0.5, 2.1);
    } else {
      context.fillStyle = "#f0b95a";
      context.fillRect(object.x - 1.8, object.y - 1.8, 4.6, 4.6);
      context.strokeRect(object.x - 1.8, object.y - 1.8, 4.6, 4.6);
    }
  }
  context.restore();
}

function drawObjectPlacementField(context: CanvasRenderingContext2D, mapData: MapData, recipe: GenerationRecipe): void {
  const objects = mapData.objectList.filter((object) => object.layerId === "surface" && object.type !== "road-node");
  if (objects.length === 0) {
    return;
  }

  if (recipe.algorithms.objectPlacement === "biome-density") {
    context.fillStyle = "rgba(53, 122, 64, 0.18)";
    context.strokeStyle = "rgba(32, 87, 43, 0.08)";
    for (const object of objects.filter((candidate) => candidate.type === "tree").slice(0, 220)) {
      drawTileCircle(context, object.x + 0.5, object.y + 0.5, 4.2);
    }
    return;
  }

  context.fillStyle = "rgba(255, 227, 117, 0.2)";
  context.strokeStyle = "rgba(99, 70, 23, 0.08)";
  for (const object of objects.slice(0, 260)) {
    context.fillRect(object.x - 1.4, object.y - 1.4, 3.8, 3.8);
  }
}

function drawTileDiamond(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  context.moveTo(x, y - radius);
  context.lineTo(x + radius, y);
  context.lineTo(x, y + radius);
  context.lineTo(x - radius, y);
  context.closePath();
  context.fill();
  context.stroke();
}

function drawTileCircle(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function normalizedEllipseDistance(
  center: { x: number; y: number },
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
): number {
  const dx = (x - center.x) / Math.max(radiusX, 1);
  const dy = (y - center.y) / Math.max(radiusY, 1);
  return Math.sqrt(dx * dx + dy * dy);
}

function stepDirection(x: number, y: number, direction: number): { x: number; y: number } {
  if (direction === 0) {
    return { x: x + 1, y };
  }
  if (direction === 1) {
    return { x, y: y + 1 };
  }
  if (direction === 2) {
    return { x: x - 1, y };
  }
  return { x, y: y - 1 };
}

function isInsideMap(mapData: MapData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mapData.width && y < mapData.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function previewNoise(seed: number, x: number, y: number, salt: number): number {
  let value = (seed ^ Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2f) ^ salt) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value / 0xffffffff;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function prepareSideBySideRecipe(
  recipe: GenerationRecipe,
  algorithms: AlgorithmSelection,
  tuning: ComparisonTuning = defaultComparisonTuning,
): GenerationRecipe {
  return {
    ...recipe,
    features: {
      ...recipe.features,
      mountains: true,
      forests: true,
      trees: true,
      roads: true,
      caves: true,
      villages: true,
    },
    algorithms: { ...algorithms },
    params: {
      ...recipe.params,
      mountainLevel: Math.max(recipe.params.mountainLevel, 0.52),
      forestDensity: Math.max(recipe.params.forestDensity, tuning.objectDensity),
      caveDensity: Math.max(recipe.params.caveDensity, tuning.caveDensity),
      roadComplexity: Math.max(recipe.params.roadComplexity, tuning.roadComplexity),
    },
  };
}

export function resolveComparisonPreviewMode(
  mode: PreviewMode,
  changedCategories: readonly AlgorithmCategory[],
): Exclude<PreviewMode, "auto"> {
  if (mode !== "auto") {
    return mode;
  }
  if (changedCategories.length > 1) {
    return "all";
  }
  if (changedCategories.includes("cave")) {
    return "cave";
  }
  if (changedCategories.includes("road")) {
    return "road";
  }
  if (changedCategories.includes("objectPlacement")) {
    return "objectPlacement";
  }
  return "surface";
}

function validateRecipe(recipe: GenerationRecipe): GenerationRecipe {
  const validation = validateGenerationRecipe(recipe);
  if (!validation.ok) {
    throw new Error(validation.issues[0]?.message ?? "알고리즘 비교 설계를 확인해주세요");
  }
  return validation.value;
}

function contrastAlgorithms(algorithms: AlgorithmSelection): AlgorithmSelection {
  return {
    terrain: oppositeAlgorithm("terrain", algorithms.terrain),
    cave: oppositeAlgorithm("cave", algorithms.cave),
    road: oppositeAlgorithm("road", algorithms.road),
    objectPlacement: oppositeAlgorithm("objectPlacement", algorithms.objectPlacement),
  };
}

function oppositeAlgorithm<K extends AlgorithmCategory>(category: K, current: AlgorithmSelection[K]): AlgorithmSelection[K] {
  const options = algorithmOptions[category] as unknown as readonly AlgorithmSelection[K][];
  return options.find((option) => option !== current) ?? current;
}

function changedAlgorithmCategories(left: AlgorithmSelection, right: AlgorithmSelection): AlgorithmCategory[] {
  return (Object.keys(categoryLabels) as AlgorithmCategory[]).filter((category) => left[category] !== right[category]);
}

function algorithmCombinationTitle(algorithms: AlgorithmSelection, peerAlgorithms: AlgorithmSelection): string {
  const changed = changedAlgorithmCategories(algorithms, peerAlgorithms);
  if (changed.length === 0) {
    return "같은 알고리즘 조합";
  }
  return changed.map((category) => algorithmLabel(algorithms[category])).join(" + ");
}

function previewModeLabel(mode: Exclude<PreviewMode, "auto">): string {
  if (mode === "all") {
    return "전체 비교";
  }
  if (mode === "surface") {
    return "대지 차이";
  }
  if (mode === "cave") {
    return "동굴 구조";
  }
  if (mode === "road") {
    return "도로 연결";
  }
  return "오브젝트 배치";
}

function previewSummary(mode: Exclude<PreviewMode, "auto">, changedCategories: readonly AlgorithmCategory[]): string {
  if (mode === "all") {
    return "동굴, 도로, 오브젝트를 한 화면에 모두 덧그립니다. A*는 노란 연결망, Simple Path는 중앙축 길, 배치 알고리즘은 큰 심볼 분포를 보세요.";
  }
  if (mode === "cave") {
    return "보라색은 동굴 바닥, 짙은 보라는 동굴 벽, 노란 마름모는 입구/포털입니다.";
  }
  if (mode === "road") {
    return "노란 선을 보고 A* 연결망과 단순 중앙축 도로를 비교하세요.";
  }
  if (mode === "objectPlacement") {
    return "나무, 동굴문, 마을 표식이 어디에 몰리는지 비교하세요.";
  }
  if (changedCategories.length === 0) {
    return "좌우 알고리즘 조합이 같습니다. 오른쪽 설계에서 하나 이상 바꿔보세요.";
  }
  return "전체 섬 윤곽과 주요 지형 색의 차이를 비교하세요.";
}

function previewNote(mode: Exclude<PreviewMode, "auto">): string {
  if (mode === "all") {
    return "전체 비교는 실제 MapData의 road 타일과 objectList를 크게 덧그려 알고리즘 차이가 묻히지 않게 합니다.";
  }
  if (mode === "cave") {
    return "동굴 알고리즘은 보라색 방/터널 구조와 짙은 보라색 벽 윤곽을 비교하면 됩니다.";
  }
  if (mode === "road") {
    return "도로 알고리즘은 노란 경로가 무엇을 연결하고 무엇을 피하는지 보면 됩니다.";
  }
  if (mode === "objectPlacement") {
    return "오브젝트 배치는 지형 위에 놓인 표식의 밀도와 위치를 비교하세요.";
  }
  return "대지 보기는 지형 알고리즘 차이를 볼 때 가장 유용합니다.";
}

function algorithmDifferenceNote(algorithms: AlgorithmSelection, peerAlgorithms: AlgorithmSelection): string {
  const changed = changedAlgorithmCategories(algorithms, peerAlgorithms);
  if (changed.length === 0) {
    return "좌우가 같은 알고리즘 조합입니다. 한쪽 알고리즘을 바꾸면 차이가 강조됩니다.";
  }
  return changed.map((category) => differenceText(category, algorithms[category])).join(" / ");
}

function differenceText(category: AlgorithmCategory, algorithm: string): string {
  if (category === "cave" && algorithm === "cellular-automata") {
    return "Cellular Automata: 이웃 셀 smoothing으로 덩어리형 동굴권을 만듭니다";
  }
  if (category === "cave" && algorithm === "random-walk") {
    return "Random Walk: 한 경로가 걸어가며 구불구불한 터널 흔적을 만듭니다";
  }
  if (category === "road" && algorithm === "astar") {
    return "A*: 높은 비용 지형을 피해 거점을 잇는 연결망을 만듭니다";
  }
  if (category === "road" && algorithm === "simple-path") {
    return "Simple Path: 중앙을 관통하는 단순 축 도로를 만듭니다";
  }
  if (category === "terrain" && algorithm === "noise-island") {
    return "Noise Island: 불규칙한 노이즈 섬 윤곽을 만듭니다";
  }
  if (category === "terrain" && algorithm === "radial-island") {
    return "Radial Island: 중심에서 바깥으로 낮아지는 방사형 섬을 만듭니다";
  }
  if (category === "objectPlacement" && algorithm === "biome-density") {
    return "Biome Density: 바이옴 조건이 맞는 곳에 오브젝트가 모입니다";
  }
  return "Scatter: 조건을 덜 타고 오브젝트가 더 흩어집니다";
}

function hasCaveFootprint(mapData: MapData): boolean {
  return caveTileCount(mapData) > 0;
}

function caveTileCount(mapData: MapData): number {
  return mapData.terrainMap.filter((terrain) => terrain === "cave-floor" || terrain === "cave-wall").length;
}

function objectTypeSummary(mapData: MapData): string {
  const trees = mapData.objectList.filter((object) => object.type === "tree").length;
  const rocks = mapData.objectList.filter((object) => object.type === "rock").length;
  const villages = mapData.objectList.filter((object) => object.type === "village").length;
  return `${trees}/${rocks}/${villages}`;
}

export function calculateMapDifferenceSummary(mapData: MapData, peerMapData: MapData): MapDifferenceSummary {
  if (mapData.width !== peerMapData.width || mapData.height !== peerMapData.height) {
    return {
      changedTiles: 0,
      changedRatio: 0,
      terrainChanged: 0,
      heightChanged: 0,
      collisionChanged: 0,
      costChanged: 0,
      objectChanged: 0,
    };
  }

  const changedTileIndexes = new Set<number>();
  let terrainChanged = 0;
  let heightChanged = 0;
  let collisionChanged = 0;
  let costChanged = 0;

  for (let index = 0; index < mapData.terrainMap.length; index += 1) {
    if (mapData.terrainMap[index] !== peerMapData.terrainMap[index]) {
      terrainChanged += 1;
      changedTileIndexes.add(index);
    }
    if (Math.abs((mapData.heightMap[index] ?? 0) - (peerMapData.heightMap[index] ?? 0)) > 0.035) {
      heightChanged += 1;
      changedTileIndexes.add(index);
    }
    if (mapData.collisionMap[index] !== peerMapData.collisionMap[index]) {
      collisionChanged += 1;
      changedTileIndexes.add(index);
    }
    if (Math.abs((mapData.costMap[index] ?? 0) - (peerMapData.costMap[index] ?? 0)) >= 2) {
      costChanged += 1;
      changedTileIndexes.add(index);
    }
  }

  const objectDiffTiles = objectDifferenceTileIndexes(mapData, peerMapData);
  for (const index of objectDiffTiles) {
    changedTileIndexes.add(index);
  }

  const tileCount = Math.max(1, mapData.width * mapData.height);
  return {
    changedTiles: changedTileIndexes.size,
    changedRatio: changedTileIndexes.size / tileCount,
    terrainChanged,
    heightChanged,
    collisionChanged,
    costChanged,
    objectChanged: objectDiffTiles.size,
  };
}

function objectDifferenceTileIndexes(mapData: MapData, peerMapData: MapData): Set<number> {
  const mapObjects = objectTileKeySet(mapData);
  const peerObjects = objectTileKeySet(peerMapData);
  const changed = new Set<number>();

  for (const key of mapObjects) {
    if (!peerObjects.has(key)) {
      changed.add(objectKeyToTileIndex(key, mapData.width));
    }
  }
  for (const key of peerObjects) {
    if (!mapObjects.has(key)) {
      changed.add(objectKeyToTileIndex(key, mapData.width));
    }
  }
  return changed;
}

function objectTileKeySet(mapData: MapData): Set<string> {
  return new Set(
    mapData.objectList
      .filter((object) => object.layerId === "surface" && object.type !== "road-node")
      .map((object) => `${object.type}:${object.x}:${object.y}`),
  );
}

function objectKeyToTileIndex(key: string, width: number): number {
  const [, x, y] = key.split(":");
  return Number(y) * width + Number(x);
}

function differenceTypeSummary(summary: MapDifferenceSummary): string {
  const entries = [
    ["지형", summary.terrainChanged],
    ["높이", summary.heightChanged],
    ["이동", summary.collisionChanged + summary.costChanged],
    ["오브젝트", summary.objectChanged],
  ] as const;
  return entries
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([label]) => label)
    .join("/") || "동일";
}
