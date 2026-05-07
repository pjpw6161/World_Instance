import { useCallback, useEffect, useRef, useState } from "react";
import { validateGenerationRecipe, type GenerationRecipe, type MapData, type ViewMode } from "@world-forge/shared";
import { ControlPanel } from "../components/ControlPanel";
import { MapViewport } from "../components/MapViewport";
import { StatsPanel } from "../components/StatsPanel";
import { AuthStatus } from "../components/AuthStatus";
import { createEditorEngine, type EditorEngine, type EditorEngineRuntime } from "../editor/engineAdapter";
import { cloneRecipe, createInitialRecipe } from "../editor/editorState";
import { sampleWorldPresets, type SampleWorldPreset } from "../editor/sampleWorlds";
import { appName, statusLabel } from "../i18n/korean";
import {
  createMapProject,
  createWorldInstance,
  fetchMapProject,
  updateMapProjectVisibility,
  type MapProjectPayload,
  type MapVisibility,
} from "../world/worldApi";

const initialEngineRuntime: EditorEngineRuntime = {
  kind: "wasm",
  label: "WASM",
  detail: "/wasm/world_forge_engine.wasm",
};

export function EditorPage() {
  const [recipe, setRecipe] = useState<GenerationRecipe>(() => createInitialRecipe());
  const [generatedRecipe, setGeneratedRecipe] = useState<GenerationRecipe | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("terrain-2d");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [engineRuntime, setEngineRuntime] = useState<EditorEngineRuntime>(initialEngineRuntime);
  const [projectTitle, setProjectTitle] = useState("이름 없는 세계");
  const [projectDescription, setProjectDescription] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "ready" | "error">("idle");
  const [savedProject, setSavedProject] = useState<MapProjectPayload | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const engineRef = useRef<EditorEngine | null>(null);
  const loadedSourceMapIdRef = useRef<string | null>(null);

  const getEngine = useCallback(() => {
    engineRef.current ??= createEditorEngine({
      onRuntimeChange: setEngineRuntime,
    });
    return engineRef.current;
  }, []);

  const applySamplePreset = useCallback((preset: SampleWorldPreset) => {
    setRecipe(cloneRecipe(preset.recipe));
    setProjectTitle(preset.title);
    setProjectDescription(preset.description);
    setGeneratedRecipe(null);
    setMapData(null);
    setSavedProject(null);
    setSaveStatus("idle");
    setSaveError(null);
    setError(null);
    setStatus("idle");
  }, []);

  const generateMap = useCallback(
    async (nextRecipe: GenerationRecipe, sourceProject?: MapProjectPayload) => {
      const validation = validateGenerationRecipe(nextRecipe);
      if (!validation.ok) {
        setError(validation.issues[0]?.message ?? "세계 설계를 다시 확인해주세요");
        setStatus("invalid");
        return;
      }

      setStatus("generating");
      setError(null);
      try {
        const engine = getEngine();
        const generated = await engine.generate(validation.value);
        setMapData(generated);
        setGeneratedRecipe(validation.value);
        setSavedProject(sourceProject ?? null);
        setSaveStatus(sourceProject ? "ready" : "idle");
        setSaveError(null);
        setEngineRuntime(engine.runtime());
        setStatus("ready");
      } catch (unknownError) {
        setError(unknownError instanceof Error ? unknownError.message : "세계를 빚지 못했습니다");
        setStatus("error");
      }
    },
    [getEngine],
  );

  const saveMap = useCallback(
    async (visibility: MapVisibility) => {
      if (!mapData) {
        setSaveError("먼저 지도를 빚어주세요");
        setSaveStatus("error");
        return;
      }
      if (!generatedRecipe) {
        setSaveError("생성 설계가 비어 있습니다");
        setSaveStatus("error");
        return;
      }
      setSaveStatus("saving");
      setSaveError(null);
      try {
        const created = await createMapProject({
          title: projectTitle.trim() || `인장 ${mapData.mapHash.slice(0, 8)}의 세계`,
          description: projectDescription.trim(),
          recipe: generatedRecipe,
          stats: mapData.stats,
          mapHash: mapData.mapHash,
        });
        const finalProject =
          visibility === "PUBLIC" ? await updateMapProjectVisibility(created.id, "PUBLIC") : created;
        setSavedProject(finalProject);
        setSaveStatus("ready");
      } catch (unknownError) {
        setSaveError(unknownError instanceof Error ? unknownError.message : "지도를 저장하지 못했습니다");
        setSaveStatus("error");
      }
    },
    [generatedRecipe, mapData, projectDescription, projectTitle],
  );

  const openWorld = useCallback(async () => {
    if (!savedProject?.currentVersionId) {
      setSaveError("먼저 지도를 저장해주세요");
      setSaveStatus("error");
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const world = await createWorldInstance({
        mapVersionId: savedProject.currentVersionId,
        name: savedProject.title,
      });
      window.location.assign(`/world/${encodeURIComponent(world.worldInstance.id)}`);
    } catch (unknownError) {
      setSaveError(unknownError instanceof Error ? unknownError.message : "월드 인스턴스를 열지 못했습니다");
      setSaveStatus("error");
    }
  }, [savedProject]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    const sourceMapId = new URLSearchParams(window.location.search).get("mapId");
    if (!sourceMapId || loadedSourceMapIdRef.current === sourceMapId) {
      return;
    }
    loadedSourceMapIdRef.current = sourceMapId;
    setStatus("loading");
    setError(null);
    void fetchMapProject(sourceMapId)
      .then((project) => {
        if (!project.currentVersion) {
          throw new Error("현재 버전이 없는 지도입니다");
        }
        setProjectTitle(project.title);
        setProjectDescription(project.description);
        setRecipe(project.currentVersion.recipe);
        return generateMap(project.currentVersion.recipe, project);
      })
      .catch((unknownError) => {
        setError(unknownError instanceof Error ? unknownError.message : "저장된 지도를 열지 못했습니다");
        setStatus("error");
      });
  }, [generateMap]);

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>창조실</h1>
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
          <a className="text-link" href="/dashboard">
            내 세계
          </a>
          <a className="text-link" href="/compare">
            알고리즘 비교실
          </a>
          <a className="text-link" href="/determinism">
            결정성 검증
          </a>
          <a className="text-link" href="/gallery">
            탐험관
          </a>
          <AuthStatus />
        </nav>
      </header>

      <div className="editor-layout">
        <ControlPanel
          recipe={recipe}
          isGenerating={status === "generating"}
          samplePresets={sampleWorldPresets}
          onRecipeChange={setRecipe}
          onGenerate={() => void generateMap(recipe)}
          onSampleSelect={applySamplePreset}
        />
        <div className="preview-column">
          <MapViewport
            mapData={mapData}
            viewMode={viewMode}
            status={status}
            error={error}
            onViewModeChange={setViewMode}
          />
          <StatsPanel mapData={mapData} />
          <section className="project-panel" aria-label="지도 저장">
            <div className="project-fields">
              <label>
                <span>세계 이름</span>
                <input type="text" value={projectTitle} maxLength={160} onChange={(event) => setProjectTitle(event.target.value)} />
              </label>
              <label>
                <span>기록 한 줄</span>
                <input type="text" value={projectDescription} maxLength={2000} onChange={(event) => setProjectDescription(event.target.value)} />
              </label>
            </div>
            <div className="project-actions">
              <button type="button" className="secondary-button" onClick={() => void saveMap("PRIVATE")} disabled={!mapData || saveStatus === "saving"}>
                비공개로 보관
              </button>
              <button type="button" className="secondary-button" onClick={() => void saveMap("PUBLIC")} disabled={!mapData || saveStatus === "saving"}>
                공개 지도장에 올리기
              </button>
              <button type="button" className="generate-button" onClick={() => void openWorld()} disabled={!savedProject?.currentVersionId || saveStatus === "saving"}>
                세계로 들어가기
              </button>
            </div>
            <div className="project-status">
              <span className="status-pill">{statusLabel(saveStatus)}</span>
              {savedProject ? <code>{savedProject.id}</code> : null}
            </div>
            {saveError ? <p className="error-line">{saveError}</p> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
