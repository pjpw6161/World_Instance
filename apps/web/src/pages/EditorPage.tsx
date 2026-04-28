import { useCallback, useEffect, useRef, useState } from "react";
import { validateGenerationRecipe, type GenerationRecipe, type MapData, type ViewMode } from "@world-forge/shared";
import { ControlPanel } from "../components/ControlPanel";
import { MapViewport } from "../components/MapViewport";
import { StatsPanel } from "../components/StatsPanel";
import { AuthStatus } from "../components/AuthStatus";
import { createEditorEngine, type EditorEngine, type EditorEngineRuntime } from "../editor/engineAdapter";
import { createInitialRecipe } from "../editor/editorState";
import {
  createMapProject,
  createWorldInstance,
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
  const [projectTitle, setProjectTitle] = useState("Untitled World");
  const [projectDescription, setProjectDescription] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "ready" | "error">("idle");
  const [savedProject, setSavedProject] = useState<MapProjectPayload | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const engineRef = useRef<EditorEngine | null>(null);

  const getEngine = useCallback(() => {
    engineRef.current ??= createEditorEngine({
      onRuntimeChange: setEngineRuntime,
    });
    return engineRef.current;
  }, []);

  const generateMap = useCallback(
    async (nextRecipe: GenerationRecipe) => {
      const validation = validateGenerationRecipe(nextRecipe);
      if (!validation.ok) {
        setError(validation.issues[0]?.message ?? "Invalid recipe");
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
        setSavedProject(null);
        setSaveStatus("idle");
        setSaveError(null);
        setEngineRuntime(engine.runtime());
        setStatus("ready");
      } catch (unknownError) {
        setError(unknownError instanceof Error ? unknownError.message : "Generation failed");
        setStatus("error");
      }
    },
    [getEngine],
  );

  const saveMap = useCallback(
    async (visibility: MapVisibility) => {
      if (!mapData) {
        setSaveError("Generate a map first");
        setSaveStatus("error");
        return;
      }
      if (!generatedRecipe) {
        setSaveError("Generated recipe is missing");
        setSaveStatus("error");
        return;
      }
      setSaveStatus("saving");
      setSaveError(null);
      try {
        const created = await createMapProject({
          title: projectTitle.trim() || `World ${mapData.mapHash.slice(0, 8)}`,
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
        setSaveError(unknownError instanceof Error ? unknownError.message : "Could not save map");
        setSaveStatus("error");
      }
    },
    [generatedRecipe, mapData, projectDescription, projectTitle],
  );

  const openWorld = useCallback(async () => {
    if (!savedProject?.currentVersionId) {
      setSaveError("Save the map first");
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
      setSaveError(unknownError instanceof Error ? unknownError.message : "Could not create world");
      setSaveStatus("error");
    }
  }, [savedProject]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p>World Forge</p>
          <h1>Editor</h1>
        </div>
        <div className={`engine-runtime ${engineRuntime.kind}`}>
          <span>Engine</span>
          <strong>{engineRuntime.label}</strong>
          <small>{engineRuntime.detail}</small>
        </div>
        <nav className="top-nav" aria-label="Navigation">
          <a className="text-link" href="/maps">
            My Maps
          </a>
          <a className="text-link" href="/gallery">
            Gallery
          </a>
          <AuthStatus />
        </nav>
      </header>

      <div className="editor-layout">
        <ControlPanel
          recipe={recipe}
          isGenerating={status === "generating"}
          onRecipeChange={setRecipe}
          onGenerate={() => void generateMap(recipe)}
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
          <section className="project-panel" aria-label="Project actions">
            <div className="project-fields">
              <label>
                <span>Title</span>
                <input type="text" value={projectTitle} maxLength={160} onChange={(event) => setProjectTitle(event.target.value)} />
              </label>
              <label>
                <span>Description</span>
                <input type="text" value={projectDescription} maxLength={2000} onChange={(event) => setProjectDescription(event.target.value)} />
              </label>
            </div>
            <div className="project-actions">
              <button type="button" className="secondary-button" onClick={() => void saveMap("PRIVATE")} disabled={!mapData || saveStatus === "saving"}>
                Save Private
              </button>
              <button type="button" className="secondary-button" onClick={() => void saveMap("PUBLIC")} disabled={!mapData || saveStatus === "saving"}>
                Save Public
              </button>
              <button type="button" className="generate-button" onClick={() => void openWorld()} disabled={!savedProject?.currentVersionId || saveStatus === "saving"}>
                Open World
              </button>
            </div>
            <div className="project-status">
              <span className="status-pill">{saveStatus}</span>
              {savedProject ? <code>{savedProject.id}</code> : null}
            </div>
            {saveError ? <p className="error-line">{saveError}</p> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
