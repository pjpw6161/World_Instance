import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { validateGenerationRecipe, type MapData } from "@world-forge/shared";
import { createEditorEngine, type EditorEngine } from "../editor/engineAdapter";
import { WorldCanvas } from "../world/WorldCanvas";
import { assertGeneratedMapMatchesStoredHash } from "../world/mapIntegrity";
import { fetchMapVersion, fetchWorldState, saveWorldState } from "../world/worldApi";
import { heightDiffMovementReadiness, type Terrain3DViewMode } from "../world/terrain3d";
import {
  activatePlayerPortal,
  activeLayerForEntities,
  createInitialWorldEntities,
  fromEntityStateDto,
  movePlayer,
  portalAt,
  serializeWorldEntities,
  tickWanderingEntities,
  type WorldEntity,
} from "../world/worldState";

interface WorldPageProps {
  worldInstanceId: string;
}

type WorldStatus = "loading" | "ready" | "saving" | "error";
type WorldViewMode = "terrain-2d" | "terrain-3d";
const WorldTerrain3D = lazy(() => import("../world/WorldTerrain3D").then((module) => ({ default: module.WorldTerrain3D })));

export function WorldPage({ worldInstanceId }: WorldPageProps) {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [worldTime, setWorldTime] = useState(0);
  const [worldName, setWorldName] = useState("World Instance");
  const [mapHash, setMapHash] = useState("");
  const [status, setStatus] = useState<WorldStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [worldViewMode, setWorldViewMode] = useState<WorldViewMode>("terrain-2d");
  const [terrain3DViewMode, setTerrain3DViewMode] = useState<Terrain3DViewMode>("orbit");
  const engineRef = useRef<EditorEngine | null>(null);

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
      assertGeneratedMapMatchesStoredHash(generatedMap, mapVersion.mapHash);
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

  const activateCurrentPortal = useCallback(() => {
    if (!mapData || status !== "ready") {
      return;
    }
    const player = entities.find((entity) => entity.entityType === "player");
    if (!player || !portalAt(mapData, player.layerId, player.x, player.y)) {
      return;
    }
    setEntities((currentEntities) => activatePlayerPortal(mapData, currentEntities));
    setWorldTime((currentTime) => currentTime + 1);
  }, [entities, mapData, status]);

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
        if (isPortalKey(event.key)) {
          event.preventDefault();
          activateCurrentPortal();
        }
        return;
      }
      event.preventDefault();
      setWorldTime((currentTime) => {
        setEntities((currentEntities) => movePlayer(mapData, currentEntities, direction.dx, direction.dy, currentTime));
        return currentTime + 1;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activateCurrentPortal, mapData, status]);

  const player = entities.find((entity) => entity.entityType === "player");
  const activeLayerId = activeLayerForEntities(entities);
  const lastMoveCost = player?.metadataJson.lastMoveCost;
  const activePortal = mapData && player ? portalAt(mapData, player.layerId, player.x, player.y) : null;
  const heightReadiness = mapData && player ? heightDiffMovementReadiness(mapData, player) : null;

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
          <div className="world-view-toolbar" aria-label="World view controls">
            <div className="view-tabs world-mode-tabs">
              <button type="button" className={worldViewMode === "terrain-2d" ? "active" : ""} onClick={() => setWorldViewMode("terrain-2d")}>
                2D
              </button>
              <button type="button" className={worldViewMode === "terrain-3d" ? "active" : ""} onClick={() => setWorldViewMode("terrain-3d")}>
                3D
              </button>
            </div>
            {worldViewMode === "terrain-3d" ? (
              <div className="view-tabs world-camera-tabs" aria-label="3D camera">
                <button type="button" className={terrain3DViewMode === "orbit" ? "active" : ""} onClick={() => setTerrain3DViewMode("orbit")}>
                  Orbit
                </button>
                <button type="button" className={terrain3DViewMode === "top" ? "active" : ""} onClick={() => setTerrain3DViewMode("top")}>
                  Top
                </button>
                <button type="button" className={terrain3DViewMode === "side" ? "active" : ""} onClick={() => setTerrain3DViewMode("side")}>
                  Side
                </button>
              </div>
            ) : null}
          </div>
          {mapData ? (
            worldViewMode === "terrain-3d" ? (
              <div className="world-3d-frame">
                <Suspense fallback={<div className="empty-preview">Loading 3D view</div>}>
                  <WorldTerrain3D mapData={mapData} entities={entities} activeLayerId={activeLayerId} viewMode={terrain3DViewMode} />
                </Suspense>
              </div>
            ) : (
              <div className="canvas-frame world-frame">
                <WorldCanvas mapData={mapData} entities={entities} activeLayerId={activeLayerId} />
              </div>
            )
          ) : (
            <div className="canvas-frame world-frame">
              <div className="empty-preview">Loading world</div>
            </div>
          )}
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
            <span>Layer</span>
            <strong>{activeLayerId}</strong>
          </div>
          <div className="world-state-row">
            <span>Portal</span>
            <strong>{activePortal ? `${activePortal.toLayerId} ${activePortal.targetX}, ${activePortal.targetY}` : "-"}</strong>
          </div>
          <button type="button" className="secondary-button world-portal-button" onClick={activateCurrentPortal} disabled={!activePortal || status !== "ready"}>
            Use Portal
          </button>
          <div className="world-state-row">
            <span>Move Cost</span>
            <strong>{typeof lastMoveCost === "number" ? lastMoveCost : "-"}</strong>
          </div>
          <div className="world-state-row">
            <span>Jump</span>
            <strong>{player ? player.jumpHeight.toFixed(2) : "-"}</strong>
          </div>
          <div className="world-state-row">
            <span>Max Slope</span>
            <strong>{player ? player.maxSlope.toFixed(2) : "-"}</strong>
          </div>
          <div className="world-state-row">
            <span>Height Moves</span>
            <strong>
              {heightReadiness
                ? `${heightReadiness.reachableDirections}/${heightReadiness.checkedDirections} max diff ${heightReadiness.maxAdjacentHeightDiff.toFixed(2)}`
                : "-"}
            </strong>
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

function isPortalKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "e" || key === "E";
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, button"));
}
