import { useCallback, useEffect, useRef, useState } from "react";
import { validateGenerationRecipe, type MapData } from "@world-forge/shared";
import type { WorldForgeWasmEngine } from "@world-forge/wasm-engine";
import { createEditorEngine } from "../editor/engineAdapter";
import { WorldCanvas } from "../world/WorldCanvas";
import { fetchMapVersion, fetchWorldState, saveWorldState } from "../world/worldApi";
import {
  createInitialWorldEntities,
  fromEntityStateDto,
  movePlayer,
  serializeWorldEntities,
  tickWanderingEntities,
  type WorldEntity,
} from "../world/worldState";

interface WorldPageProps {
  worldInstanceId: string;
}

type WorldStatus = "loading" | "ready" | "saving" | "error";

export function WorldPage({ worldInstanceId }: WorldPageProps) {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [worldTime, setWorldTime] = useState(0);
  const [worldName, setWorldName] = useState("World Instance");
  const [mapHash, setMapHash] = useState("");
  const [status, setStatus] = useState<WorldStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<WorldForgeWasmEngine | null>(null);

  const getEngine = useCallback(() => {
    engineRef.current ??= createEditorEngine();
    return engineRef.current;
  }, []);

  const loadWorld = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const state = await fetchWorldState(worldInstanceId);
      const mapVersion = await fetchMapVersion(state.worldInstance.mapVersionId);
      const recipe = validateGenerationRecipe(mapVersion.recipe);
      if (!recipe.ok) {
        throw new Error(recipe.issues[0]?.message ?? "Invalid map recipe");
      }
      const generatedMap = await getEngine().generate(recipe.value);
      const loadedEntities =
        state.entities.length > 0
          ? state.entities.map(fromEntityStateDto)
          : createInitialWorldEntities(state.worldInstance.id, generatedMap);

      setMapData(generatedMap);
      setEntities(loadedEntities);
      setWorldTime(state.worldInstance.worldTime);
      setWorldName(state.worldInstance.name);
      setMapHash(mapVersion.mapHash);
      setStatus("ready");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Could not load world");
      setStatus("error");
    }
  }, [getEngine, worldInstanceId]);

  const saveCurrentState = useCallback(async () => {
    if (!mapData) {
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const saved = await saveWorldState(worldInstanceId, worldTime, serializeWorldEntities(entities));
      setEntities(saved.entities.map(fromEntityStateDto));
      setWorldTime(saved.worldInstance.worldTime);
      setStatus("ready");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Could not save world");
      setStatus("error");
    }
  }, [entities, mapData, worldInstanceId, worldTime]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadWorld();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadWorld]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!mapData || status !== "ready") {
      return;
    }
    const intervalId = window.setInterval(() => {
      setWorldTime((currentTime) => {
        const nextTime = currentTime + 1;
        setEntities((currentEntities) => tickWanderingEntities(mapData, currentEntities, nextTime));
        return nextTime;
      });
    }, 700);
    return () => window.clearInterval(intervalId);
  }, [mapData, status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!mapData || status !== "ready" || isTypingTarget(event.target)) {
        return;
      }
      const direction = keyToDirection(event.key);
      if (!direction) {
        return;
      }
      event.preventDefault();
      setEntities((currentEntities) => movePlayer(mapData, currentEntities, direction.dx, direction.dy));
      setWorldTime((currentTime) => currentTime + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mapData, status]);

  const player = entities.find((entity) => entity.entityType === "player");

  return (
    <main className="world-shell">
      <header className="world-header">
        <div>
          <p>World Forge</p>
          <h1>{worldName}</h1>
        </div>
        <div className="world-actions">
          <a className="text-link" href="/editor">
            Editor
          </a>
          <button type="button" className="secondary-button" onClick={() => void loadWorld()}>
            Reload
          </button>
          <button type="button" className="generate-button save-button" onClick={() => void saveCurrentState()} disabled={!mapData || status === "saving"}>
            Save
          </button>
        </div>
      </header>

      <div className="world-layout">
        <section className="world-stage" aria-label="World view">
          <div className="canvas-frame world-frame">
            {mapData ? <WorldCanvas mapData={mapData} entities={entities} /> : <div className="empty-preview">Loading world</div>}
          </div>
          {error ? <p className="error-line">{error}</p> : null}
        </section>

        <aside className="world-sidebar" aria-label="World state">
          <div className="world-state-row">
            <span>Status</span>
            <strong>{status}</strong>
          </div>
          <div className="world-state-row">
            <span>World time</span>
            <strong>{worldTime}</strong>
          </div>
          <div className="world-state-row">
            <span>Player</span>
            <strong>{player ? `${player.x}, ${player.y}` : "none"}</strong>
          </div>
          <div className="world-state-row">
            <span>Entities</span>
            <strong>{entities.length}</strong>
          </div>
          <div className="world-hash">
            <span className="stat-label">Map hash</span>
            <code>{mapHash || "not loaded"}</code>
          </div>
        </aside>
      </div>
    </main>
  );
}

function keyToDirection(key: string): { dx: number; dy: number } | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return { dx: 0, dy: -1 };
    case "ArrowDown":
    case "s":
    case "S":
      return { dx: 0, dy: 1 };
    case "ArrowLeft":
    case "a":
    case "A":
      return { dx: -1, dy: 0 };
    case "ArrowRight":
    case "d":
    case "D":
      return { dx: 1, dy: 0 };
    default:
      return null;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, button"));
}
