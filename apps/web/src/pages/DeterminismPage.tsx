import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { validateGenerationRecipe, type GenerationRecipe, type MapData } from "@world-forge/shared";
import { AuthStatus } from "../components/AuthStatus";
import { createEditorEngine, type EditorEngine, type EditorEngineRuntime } from "../editor/engineAdapter";
import { cloneRecipe, formatPercent, withMapSize, withSeed } from "../editor/editorState";
import { samplePresetById, sampleWorldPresets } from "../editor/sampleWorlds";
import { appName, statusLabel } from "../i18n/korean";
import { TerrainMapView } from "../renderers/canvasRenderers";

interface TimedMap {
  mapData: MapData;
  elapsedMs: number;
}

interface DeterminismRun {
  first: TimedMap;
  repeat: TimedMap;
  changedSeed: TimedMap;
}

interface BenchmarkRun {
  size: number;
  mapHash: string;
  elapsedMs: number;
  engineMs: number;
  tileCount: number;
}

const initialRuntime: EditorEngineRuntime = {
  kind: "wasm",
  label: "WASM",
  detail: "/wasm/world_forge_engine.wasm",
};

export function DeterminismPage() {
  const [presetId, setPresetId] = useState(sampleWorldPresets[0].id);
  const [seed, setSeed] = useState(sampleWorldPresets[0].recipe.seed);
  const [status, setStatus] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [determinismRun, setDeterminismRun] = useState<DeterminismRun | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkRun[]>([]);
  const [engineRuntime, setEngineRuntime] = useState<EditorEngineRuntime>(initialRuntime);
  const engineRef = useRef<EditorEngine | null>(null);
  const generatedOnceRef = useRef(false);

  const getEngine = useCallback(() => {
    engineRef.current ??= createEditorEngine({
      onRuntimeChange: setEngineRuntime,
    });
    return engineRef.current;
  }, []);

  const buildRecipe = useCallback((size = 128, nextSeed = seed): GenerationRecipe => {
    const preset = samplePresetById(presetId);
    return withSeed(withMapSize(cloneRecipe(preset.recipe), size, size), nextSeed);
  }, [presetId, seed]);

  const runDeterminismCheck = useCallback(async () => {
    setStatus("generating");
    setError(null);
    try {
      const engine = getEngine();
      const baseRecipe = validateRecipe(buildRecipe(128, seed));
      const repeatedRecipe = validateRecipe(buildRecipe(128, seed));
      const changedSeedRecipe = validateRecipe(buildRecipe(128, (seed + 1) >>> 0));

      const first = await timedGenerate(engine, baseRecipe);
      const repeat = await timedGenerate(engine, repeatedRecipe);
      const changedSeed = await timedGenerate(engine, changedSeedRecipe);

      const nextBenchmarks: BenchmarkRun[] = [];
      for (const size of [64, 128, 256]) {
        const recipe = validateRecipe(buildRecipe(size, seed));
        const timed = await timedGenerate(engine, recipe);
        nextBenchmarks.push({
          size,
          mapHash: timed.mapData.mapHash,
          elapsedMs: timed.elapsedMs,
          engineMs: timed.mapData.stats.generationTimeMs,
          tileCount: timed.mapData.width * timed.mapData.height,
        });
      }

      setDeterminismRun({ first, repeat, changedSeed });
      setBenchmarks(nextBenchmarks);
      setEngineRuntime(engine.runtime());
      setStatus("ready");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "결정성/성능 검증을 실행하지 못했습니다");
      setStatus("error");
    }
  }, [buildRecipe, getEngine, seed]);

  useEffect(() => {
    if (generatedOnceRef.current) {
      return;
    }
    generatedOnceRef.current = true;
    void runDeterminismCheck();
  }, [runDeterminismCheck]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  function onPresetChange(event: ChangeEvent<HTMLSelectElement>) {
    const preset = samplePresetById(event.target.value);
    setPresetId(preset.id);
    setSeed(preset.recipe.seed);
  }

  const sameHash = determinismRun ? determinismRun.first.mapData.mapHash === determinismRun.repeat.mapData.mapHash : false;
  const changedSeedDifferent = determinismRun ? determinismRun.first.mapData.mapHash !== determinismRun.changedSeed.mapData.mapHash : false;

  return (
    <main className="editor-shell algorithm-lab-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>결정성 / 성능 검증실</h1>
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
          <a className="text-link" href="/compare">
            비교실
          </a>
          <a className="text-link" href="/editor">
            창조실
          </a>
          <a className="text-link" href="/gallery">
            탐험관
          </a>
          <AuthStatus />
        </nav>
      </header>

      <section className="algorithm-lab">
        <div className="algorithm-lab-intro">
          <div>
            <span className="stat-label">Determinism and generation timing</span>
            <h2>같은 설계는 같은 mapHash를 만들고, seed 변경은 다른 세계를 만듭니다</h2>
            <p>
              포트폴리오 설명용 검증 화면입니다. 브라우저 WASM 엔진이 같은 recipe를 반복 생성할 때 같은 결과를 내는지,
              그리고 맵 크기별 생성 시간이 어느 정도인지 확인합니다.
            </p>
          </div>
          <span className="status-pill">{statusLabel(status)}</span>
        </div>

        <div className="algorithm-lab-controls determinism-controls">
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
            <span>기준 시드</span>
            <input type="number" min={0} max={4294967295} value={seed} onChange={(event) => setSeed(Number(event.target.value))} />
          </label>
          <button type="button" className="generate-button" onClick={() => void runDeterminismCheck()} disabled={status === "generating"}>
            {status === "generating" ? "검증 실행 중" : "검증 다시 실행"}
          </button>
        </div>

        {error ? <p className="error-line">{error}</p> : null}

        {determinismRun ? (
          <div className="determinism-grid">
            <section className={`determinism-card ${sameHash ? "pass" : "fail"}`}>
              <span className="stat-label">Same recipe, same seed</span>
              <h2>{sameHash ? "결정성 통과" : "결정성 실패"}</h2>
              <p>반복 생성 mapHash가 {sameHash ? "동일합니다" : "다릅니다"}.</p>
              <code>{determinismRun.first.mapData.mapHash}</code>
              <code>{determinismRun.repeat.mapData.mapHash}</code>
            </section>
            <section className={`determinism-card ${changedSeedDifferent ? "pass" : "fail"}`}>
              <span className="stat-label">Same recipe, changed seed</span>
              <h2>{changedSeedDifferent ? "시드 차이 반영" : "시드 차이 미반영"}</h2>
              <p>시드를 1 바꾸면 mapHash가 {changedSeedDifferent ? "달라집니다" : "같게 나옵니다"}.</p>
              <code>{determinismRun.changedSeed.mapData.mapHash}</code>
            </section>
            <section className="determinism-card preview">
              <span className="stat-label">Baseline preview</span>
              <h2>기준 지도</h2>
              <div className="determinism-preview">
                <TerrainMapView mapData={determinismRun.first.mapData} />
              </div>
            </section>
          </div>
        ) : null}

        <section className="benchmark-panel" aria-label="맵 크기별 생성 시간">
          <div className="benchmark-heading">
            <span className="stat-label">Size benchmark</span>
            <h2>맵 크기별 생성 시간</h2>
          </div>
          <div className="benchmark-table">
            <div className="benchmark-row header">
              <span>크기</span>
              <span>타일</span>
              <span>브라우저 측정</span>
              <span>엔진 reported</span>
              <span>요약</span>
            </div>
            {benchmarks.map((benchmark) => (
              <div key={benchmark.size} className="benchmark-row">
                <span>{benchmark.size} x {benchmark.size}</span>
                <span>{benchmark.tileCount.toLocaleString("ko-KR")}</span>
                <span>{benchmark.elapsedMs.toFixed(1)} ms</span>
                <span>{benchmark.engineMs.toFixed(1)} ms</span>
                <span>{benchmark.mapHash.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </section>

        {determinismRun ? (
          <section className="benchmark-panel" aria-label="기준 지도 수치">
            <div className="benchmark-heading">
              <span className="stat-label">Baseline stats</span>
              <h2>기준 지도 수치</h2>
            </div>
            <dl className="algorithm-metrics">
              <Metric label="물" value={formatPercent(determinismRun.first.mapData.stats.waterRatio)} />
              <Metric label="육지" value={formatPercent(determinismRun.first.mapData.stats.landRatio)} />
              <Metric label="숲" value={formatPercent(determinismRun.first.mapData.stats.forestRatio)} />
              <Metric label="산악" value={formatPercent(determinismRun.first.mapData.stats.mountainRatio)} />
              <Metric label="동굴" value={formatPercent(determinismRun.first.mapData.stats.caveAreaRatio)} />
              <Metric label="막힘" value={formatPercent(determinismRun.first.mapData.stats.blockedRatio)} />
            </dl>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function validateRecipe(recipe: GenerationRecipe): GenerationRecipe {
  const validation = validateGenerationRecipe(recipe);
  if (!validation.ok) {
    throw new Error(validation.issues[0]?.message ?? "지도 설계를 확인해주세요");
  }
  return validation.value;
}

async function timedGenerate(engine: EditorEngine, recipe: GenerationRecipe): Promise<TimedMap> {
  const startedAt = performance.now();
  const mapData = await engine.generate(recipe);
  return {
    mapData,
    elapsedMs: performance.now() - startedAt,
  };
}
