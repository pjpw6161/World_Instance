import { useCallback, useEffect, useRef, useState } from "react";
import { validateGenerationRecipe, type GenerationRecipe, type MapData, type ViewMode } from "@world-forge/shared";
import type { WorldForgeWasmEngine } from "@world-forge/wasm-engine";
import { ControlPanel } from "../components/ControlPanel";
import { MapViewport } from "../components/MapViewport";
import { StatsPanel } from "../components/StatsPanel";
import { createEditorEngine } from "../editor/engineAdapter";
import { createInitialRecipe } from "../editor/editorState";

export function EditorPage() {
  const [recipe, setRecipe] = useState<GenerationRecipe>(() => createInitialRecipe());
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("terrain-2d");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<WorldForgeWasmEngine | null>(null);

  const getEngine = useCallback(() => {
    engineRef.current ??= createEditorEngine();
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
        const generated = await getEngine().generate(validation.value);
        setMapData(generated);
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
