import { useCallback, useEffect, useRef, useState } from "react";
import { validateGenerationRecipe, type GenerationRecipe, type MapData, type ViewMode } from "@world-forge/shared";
import { ControlPanel } from "../components/ControlPanel";
import { MapViewport } from "../components/MapViewport";
import { StatsPanel } from "../components/StatsPanel";
import { createEditorEngine, type EditorEngine, type EditorEngineRuntime } from "../editor/engineAdapter";
import { createInitialRecipe } from "../editor/editorState";

const initialEngineRuntime: EditorEngineRuntime = {
  kind: "wasm",
  label: "WASM",
  detail: "/wasm/world_forge_engine.wasm",
};

export function EditorPage() {
  const [recipe, setRecipe] = useState<GenerationRecipe>(() => createInitialRecipe());
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("terrain-2d");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [engineRuntime, setEngineRuntime] = useState<EditorEngineRuntime>(initialEngineRuntime);
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
        setEngineRuntime(engine.runtime());
        setStatus("ready");
      } catch (unknownError) {
        setError(unknownError instanceof Error ? unknownError.message : "Generation failed");
        setStatus("error");
      }
    },
    [getEngine],
  );

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
        </div>
      </div>
    </main>
  );
}
