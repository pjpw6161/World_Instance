import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateGenerationRecipe, type MapData } from "@world-forge/shared";
import { createEditorEngine, type EditorEngine } from "../editor/engineAdapter";
import { appName, entityStateLabel, statusLabel } from "../i18n/korean";
import { WorldCanvas } from "../world/WorldCanvas";
import { assertGeneratedMapMatchesStoredHash } from "../world/mapIntegrity";
import { fetchMapVersion, fetchWorldState, saveWorldState } from "../world/worldApi";
import { createWorldIdentity } from "../world/worldIdentity";
import type { WorldMapViewMode } from "../world/worldMapRenderer";
import { heightDiffMovementReadiness, type Terrain3DViewMode } from "../world/terrain3d";
import {
  activatePlayerPortal,
  activeLayerForEntities,
  createInitialWorldEntities,
  fromEntityStateDto,
  movePlayer,
  portalAt,
  serializeWorldEntities,
  setPlayerAutoExplore,
  tickWanderingEntities,
  type WorldEntity,
  type WorldNavigationContext,
} from "../world/worldState";

interface WorldPageProps {
  worldInstanceId: string;
}

type WorldStatus = "loading" | "ready" | "saving" | "error";
type WorldViewMode = "styled-2d" | "debug-2d" | "terrain-3d";
const WorldTerrain3D = lazy(() => import("../world/WorldTerrain3D").then((module) => ({ default: module.WorldTerrain3D })));

export function WorldPage({ worldInstanceId }: WorldPageProps) {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [worldTime, setWorldTime] = useState(0);
  const [worldName, setWorldName] = useState("살아 있는 세계");
  const [mapHash, setMapHash] = useState("");
  const [status, setStatus] = useState<WorldStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [worldViewMode, setWorldViewMode] = useState<WorldViewMode>("styled-2d");
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
        throw new Error(recipe.issues[0]?.message ?? "지도 설계를 다시 확인해주세요");
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
      setError(unknownError instanceof Error ? unknownError.message : "세계를 불러오지 못했습니다");
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
      setError(unknownError instanceof Error ? unknownError.message : "세계 상태를 저장하지 못했습니다");
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
  const identityEntityKey = entities
    .map((entity) => `${entity.entityKey}:${entity.entityType}:${entity.layerId}:${entity.homeX ?? entity.x}:${entity.homeY ?? entity.y}`)
    .sort()
    .join("|");
  const worldIdentity = useMemo(() => {
    if (!mapData) {
      return null;
    }
    const stableIdentityEntities = entities.map((entity) => ({
      ...entity,
      x: entity.homeX ?? entity.x,
      y: entity.homeY ?? entity.y,
    }));
    return createWorldIdentity(mapData, stableIdentityEntities, { worldInstanceId, worldName });
    // World identity should change with stable ownership anchors, not every transient wander position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityEntityKey, mapData, worldInstanceId, worldName]);
  const navigationContext = useMemo<WorldNavigationContext>(() => {
    if (!worldIdentity) {
      return {};
    }
    return {
      core: {
        id: "core",
        label: "던전 코어",
        x: worldIdentity.core.x,
        y: worldIdentity.core.y,
        layerId: worldIdentity.core.layerId,
        kind: "core",
        tone: "wild",
        priority: 1,
      },
      pois: worldIdentity.pois.map((poi) => ({
        id: poi.id,
        label: poi.label,
        x: poi.x,
        y: poi.y,
        layerId: poi.layerId,
        kind: poi.kind,
        tone: poi.tone,
        priority: poi.priority,
      })),
      regions: worldIdentity.regions.map((region) => ({
        id: region.id,
        label: region.label,
        x: region.x,
        y: region.y,
        layerId: region.layerId,
        kind: "region",
        tone: region.tone,
        priority: 6,
      })),
    };
  }, [worldIdentity]);

  useEffect(() => {
    if (!mapData || status !== "ready") {
      return;
    }
    const intervalId = window.setInterval(() => {
      setWorldTime((currentTime) => {
        const nextTime = currentTime + 1;
        setEntities((currentEntities) => tickWanderingEntities(mapData, currentEntities, nextTime, navigationContext));
        return nextTime;
      });
    }, 700);
    return () => window.clearInterval(intervalId);
  }, [mapData, navigationContext, status]);

  const lastMoveCost = player?.metadataJson.lastMoveCost;
  const activePortal = mapData && player ? portalAt(mapData, player.layerId, player.x, player.y) : null;
  const heightReadiness = mapData && player ? heightDiffMovementReadiness(mapData, player) : null;
  const worldMapMode: WorldMapViewMode = worldViewMode === "debug-2d" ? "debug" : "styled";
  const playerAutoExplore = player?.behavior === "autoExplore";
  const playerTarget = currentTargetLabel(player);
  const visibleEntities = entities.filter((entity) => entity.layerId === activeLayerId);

  return (
    <main className="world-shell">
      <header className="world-header">
        <div>
          <p>{appName}</p>
          <h1>{worldName}</h1>
          {worldIdentity ? (
            <>
              <p className="world-subtitle">{worldIdentity.summary}</p>
              <div className="world-badges" aria-label="세계 성격 배지">
                {worldIdentity.badges.map((badge) => (
                  <span key={badge.label} className={`world-badge world-badge-${badge.tone}`} title={badge.detail}>
                    {badge.label}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <div className="world-actions">
          <a className="text-link" href="/portfolio">
            포트폴리오
          </a>
          <a className="text-link" href="/editor">
            창조실
          </a>
          <a className="text-link" href="/compare">
            비교실
          </a>
          <button type="button" className="secondary-button" onClick={() => void loadWorld()}>
            다시 불러오기
          </button>
          <button type="button" className="generate-button save-button" onClick={() => void saveCurrentState()} disabled={!mapData || status === "saving"}>
            저장
          </button>
        </div>
      </header>

      <div className="world-layout">
        <section className="world-stage" aria-label="세계 보기">
          <div className="world-view-toolbar" aria-label="세계 보기 조작">
            <div className="view-tabs world-mode-tabs">
              <button type="button" className={worldViewMode === "styled-2d" ? "active" : ""} onClick={() => setWorldViewMode("styled-2d")}>
                세계 지도
              </button>
              <button type="button" className={worldViewMode === "debug-2d" ? "active" : ""} onClick={() => setWorldViewMode("debug-2d")}>
                디버그
              </button>
              <button type="button" className={worldViewMode === "terrain-3d" ? "active" : ""} onClick={() => setWorldViewMode("terrain-3d")}>
                3D
              </button>
            </div>
            {worldViewMode === "terrain-3d" ? (
              <div className="world-camera-controls" aria-label="3D 카메라 조작">
                <div className="view-tabs world-camera-tabs" aria-label="3D 카메라 모드">
                  <button type="button" className={terrain3DViewMode === "top" ? "active" : ""} onClick={() => setTerrain3DViewMode("top")}>
                    탑뷰
                  </button>
                  <button type="button" className={terrain3DViewMode === "orbit" ? "active" : ""} onClick={() => setTerrain3DViewMode("orbit")}>
                    자유 시점
                  </button>
                </div>
                <span className="world-camera-hint">
                  {terrain3DViewMode === "top" ? "휠 이동과 확대" : "좌/우 드래그 회전, 휠 클릭 이동"}
                </span>
              </div>
            ) : null}
          </div>
          {mapData ? (
            worldViewMode === "terrain-3d" ? (
              <div className="world-3d-frame">
                <Suspense fallback={<div className="empty-preview">3D 세계를 불러오는 중</div>}>
                  <WorldTerrain3D
                    mapData={mapData}
                    entities={entities}
                    activeLayerId={activeLayerId}
                    viewMode={terrain3DViewMode}
                    identity={worldIdentity}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="canvas-frame world-frame">
                <WorldCanvas mapData={mapData} entities={entities} activeLayerId={activeLayerId} mode={worldMapMode} identity={worldIdentity} />
              </div>
            )
          ) : (
            <div className="canvas-frame world-frame">
              <div className="empty-preview">세계 불러오는 중</div>
            </div>
          )}
          {error ? <p className="error-line">{error}</p> : null}
        </section>

        <aside className="world-sidebar" aria-label="세계 상태">
          {worldIdentity ? (
            <section className="world-identity-card" aria-label="세계 정체성">
              <span className="stat-label">세계 정체성</span>
              <strong>{worldIdentity.suggestedName}</strong>
              <p>{worldIdentity.landmark.label}</p>
              <div className="world-identity-grid">
                <span>코어</span>
                <strong>{`${worldIdentity.core.x}, ${worldIdentity.core.y}`}</strong>
                <span>랜드마크</span>
                <strong>{`${worldIdentity.landmark.x}, ${worldIdentity.landmark.y}`}</strong>
                <span>지역</span>
                <strong>{worldIdentity.regions.length}</strong>
                <span>명소</span>
                <strong>{worldIdentity.pois.length}</strong>
                <span>생명체</span>
                <strong>{worldIdentity.livingStats.creatureCount}</strong>
                <span>탐험 가능</span>
                <strong>{`${Math.round(worldIdentity.livingStats.reachableAreaRatio * 100)}%`}</strong>
              </div>
            </section>
          ) : null}
          <div className="world-state-row">
            <span>상태</span>
            <strong>{statusLabel(status)}</strong>
          </div>
          <div className="world-state-row">
            <span>세계 시간</span>
            <strong>{worldTime}</strong>
          </div>
          <div className="world-state-row">
            <span>플레이어</span>
            <strong>{player ? `${player.x}, ${player.y}` : "없음"}</strong>
          </div>
          <div className="world-state-row">
            <span>층</span>
            <strong>{activeLayerId}</strong>
          </div>
          <div className="world-state-row">
            <span>문</span>
            <strong>{activePortal ? `${activePortal.toLayerId} ${activePortal.targetX}, ${activePortal.targetY}` : "-"}</strong>
          </div>
          <button type="button" className="secondary-button world-portal-button" onClick={activateCurrentPortal} disabled={!activePortal || status !== "ready"}>
            문 사용
          </button>
          <button
            type="button"
            className={`secondary-button world-portal-button ${playerAutoExplore ? "active" : ""}`}
            onClick={() => setEntities((currentEntities) => setPlayerAutoExplore(currentEntities, !playerAutoExplore))}
            disabled={!player || status !== "ready"}
          >
            {playerAutoExplore ? "자동 탐험 켜짐" : "자동 탐험 꺼짐"}
          </button>
          <div className="world-state-row">
            <span>이동 비용</span>
            <strong>{typeof lastMoveCost === "number" ? lastMoveCost : "-"}</strong>
          </div>
          <div className="world-state-row">
            <span>플레이어 상태</span>
            <strong>{player ? entityStateLabel(player.state) : "-"}</strong>
          </div>
          <div className="world-state-row">
            <span>목표</span>
            <strong>{playerTarget ?? "-"}</strong>
          </div>
          <div className="world-state-row">
            <span>도약</span>
            <strong>{player ? player.jumpHeight.toFixed(2) : "-"}</strong>
          </div>
          <div className="world-state-row">
            <span>최대 경사</span>
            <strong>{player ? player.maxSlope.toFixed(2) : "-"}</strong>
          </div>
          <div className="world-state-row">
            <span>고도 이동</span>
            <strong>
              {heightReadiness
                ? `${heightReadiness.reachableDirections}/${heightReadiness.checkedDirections} 최대 차 ${heightReadiness.maxAdjacentHeightDiff.toFixed(2)}`
                : "-"}
            </strong>
          </div>
          <div className="world-state-row">
            <span>개체</span>
            <strong>{entities.length}</strong>
          </div>
          <section className="world-entity-debug-list" aria-label="개체 상태 머신">
            <span className="stat-label">살아 있는 AI</span>
            {visibleEntities.slice(0, 6).map((entity) => (
              <div key={entity.entityKey} className="world-entity-debug-row">
                <span>{entity.entityType === "player" ? "플레이어" : entity.entityKey}</span>
                <strong>{entityStateLabel(entity.state)}</strong>
                <small>{currentTargetLabel(entity) ?? "목표 없음"}</small>
              </div>
            ))}
          </section>
          <div className="world-hash">
            <span className="stat-label">지도 인장값</span>
            <code>{mapHash || "아직 없음"}</code>
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

function currentTargetLabel(entity: WorldEntity | undefined): string | null {
  const target = entity?.metadataJson.currentTarget;
  if (!target || typeof target !== "object") {
    return null;
  }
  const label = (target as { label?: unknown }).label;
  return typeof label === "string" && label.trim() ? label : null;
}
