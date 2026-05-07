import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as THREE from "three";
import type { MapData, TerrainType } from "@world-forge/shared";
import {
  createTerrainMeshData,
  entityToTerrainPosition,
  terrainLayerSceneStyle,
  tileToTerrainPosition,
  type Terrain3DViewMode,
  type TerrainMeshData,
} from "./terrain3d";
import type { WorldIdentity, WorldIdentityLandmark, WorldSpecialPoi } from "./worldIdentity";
import type { WorldEntity } from "./worldState";

interface WorldTerrain3DProps {
  mapData: MapData;
  entities: readonly WorldEntity[];
  activeLayerId: string;
  viewMode: Terrain3DViewMode;
  identity?: WorldIdentity | null;
}

interface SceneRefs {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  entityGroup: THREE.Group;
  terrainMesh: THREE.Mesh;
  topTerrainMesh: THREE.Mesh;
  meshData: TerrainMeshData;
  fogColor: number;
  controls: CameraControlsState;
  drag: CameraDragState | null;
  animationFrame: number | null;
  render: () => void;
}

interface CameraSnapshot {
  target: THREE.Vector3;
  distance: number;
  azimuth: number;
  polar: number;
}

interface CameraTransition {
  start: CameraSnapshot;
  end: CameraSnapshot;
  startTime: number;
  durationMs: number;
}

interface CameraControlsState extends CameraSnapshot {
  mode: Terrain3DViewMode;
  transition: CameraTransition | null;
}

interface CameraDragState {
  pointerId: number;
  previousX: number;
  previousY: number;
  action: "pan" | "rotate";
}

export type { Terrain3DViewMode };

export function WorldTerrain3D({ mapData, entities, activeLayerId, viewMode, identity }: WorldTerrain3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const viewModeRef = useRef<Terrain3DViewMode>(viewMode);
  const renderErrorTimeoutRef = useRef<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    scheduleRenderError(renderErrorTimeoutRef, setRenderError, null);
    let resizeObserver: ResizeObserver | null = null;
    let cleanupControls: (() => void) | null = null;

    try {
      const meshData = createTerrainMeshData(mapData, { layerId: activeLayerId });
      const sceneStyle = terrainLayerSceneStyle(activeLayerId);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(sceneStyle.backgroundColor);
      scene.fog = null;
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = false;

      const ambientLight = new THREE.HemisphereLight(
        sceneStyle.ambientSkyColor,
        sceneStyle.ambientGroundColor,
        sceneStyle.ambientIntensity,
      );
      const keyLight = new THREE.DirectionalLight(sceneStyle.keyLightColor, sceneStyle.keyLightIntensity);
      keyLight.position.set(34, 46, 30);
      const fillLight = new THREE.DirectionalLight(0xc6d9ff, 0.34);
      fillLight.position.set(-30, 28, -18);
      scene.add(ambientLight, fillLight, keyLight);
      scene.add(createDioramaBase(meshData, activeLayerId));
      const terrainMesh = createTerrainMesh(meshData);
      const topTerrainMesh = createTopTerrainMesh(mapData, activeLayerId, meshData);
      scene.add(terrainMesh);
      scene.add(topTerrainMesh);
      scene.add(createStaticMarkerGroup(mapData, activeLayerId, meshData, identity ?? null));

      const entityGroup = new THREE.Group();
      scene.add(entityGroup);
      host.appendChild(renderer.domElement);

      const render = () => renderer.render(scene, camera);
      const controls = createCameraControls(viewModeRef.current, meshData);
      const refs: SceneRefs = {
        camera,
        renderer,
        scene,
        entityGroup,
        terrainMesh,
        topTerrainMesh,
        meshData,
        fogColor: sceneStyle.fogColor,
        controls,
        drag: null,
        animationFrame: null,
        render,
      };
      sceneRef.current = refs;
      cleanupControls = attachCameraControls(renderer.domElement, refs);

      const resize = () => {
        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderWithCamera(refs);
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();
    } catch (unknownError) {
      sceneRef.current = null;
      scheduleRenderError(
        renderErrorTimeoutRef,
        setRenderError,
        unknownError instanceof Error ? unknownError.message : "3D renderer unavailable",
      );
    }

    return () => {
      resizeObserver?.disconnect();
      cleanupControls?.();
      clearScheduledRenderError(renderErrorTimeoutRef);
      const refs = sceneRef.current;
      sceneRef.current = null;
      if (!refs) {
        return;
      }
      cancelCameraTransition(refs);
      disposeObject(refs.scene);
      refs.renderer.dispose();
      refs.renderer.domElement.remove();
    };
  }, [activeLayerId, identity, mapData]);

  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) {
      return;
    }
    updateEntityGroup(refs.entityGroup, mapData, entities, activeLayerId, refs.meshData);
    renderWithCamera(refs);
  }, [activeLayerId, entities, mapData]);

  useEffect(() => {
    viewModeRef.current = viewMode;
    const refs = sceneRef.current;
    if (!refs) {
      return;
    }
    transitionToViewMode(refs, viewMode);
  }, [viewMode]);

  return (
    <div ref={hostRef} className="world-terrain-3d" aria-label="3D 세계 보기">
      {renderError ? <div className="world-3d-error">{renderError}</div> : null}
    </div>
  );
}

function scheduleRenderError(
  timeoutRef: MutableRefObject<number | null>,
  setRenderError: Dispatch<SetStateAction<string | null>>,
  message: string | null,
): void {
  clearScheduledRenderError(timeoutRef);
  timeoutRef.current = window.setTimeout(() => {
    setRenderError(message);
    timeoutRef.current = null;
  }, 0);
}

function clearScheduledRenderError(timeoutRef: MutableRefObject<number | null>): void {
  if (timeoutRef.current === null) {
    return;
  }
  window.clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
}

function createTerrainMesh(meshData: TerrainMeshData): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(meshData.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    flatShading: true,
    metalness: 0,
    roughness: 0.96,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.rotation.x = 0;
  return mesh;
}

function createTopTerrainMesh(mapData: MapData, activeLayerId: string, meshData: TerrainMeshData): THREE.Mesh {
  const tileCount = mapData.width * mapData.height;
  const positions = new Float32Array(tileCount * 4 * 3);
  const colors = new Float32Array(tileCount * 4 * 3);
  const indices = new Uint32Array(tileCount * 6);
  let vertexOffset = 0;
  let indexOffset = 0;

  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      const tileIndex = y * mapData.width + x;
      const worldX0 = (x / mapData.width - 0.5) * meshData.terrainWidth;
      const worldX1 = ((x + 1) / mapData.width - 0.5) * meshData.terrainWidth;
      const worldZ0 = (y / mapData.height - 0.5) * meshData.terrainDepth;
      const worldZ1 = ((y + 1) / mapData.height - 0.5) * meshData.terrainDepth;
      const tileHeight = (meshData.visualHeightMap[tileIndex] ?? 0) * meshData.heightScale + 0.045;
      const color = topTerrainColorForLayer(mapData.terrainMap[tileIndex], activeLayerId);
      const vertices = [
        [worldX0, tileHeight, worldZ0],
        [worldX1, tileHeight, worldZ0],
        [worldX1, tileHeight, worldZ1],
        [worldX0, tileHeight, worldZ1],
      ] as const;

      for (const vertex of vertices) {
        const positionIndex = vertexOffset * 3;
        positions[positionIndex] = vertex[0];
        positions[positionIndex + 1] = vertex[1];
        positions[positionIndex + 2] = vertex[2];
        colors[positionIndex] = color[0];
        colors[positionIndex + 1] = color[1];
        colors[positionIndex + 2] = color[2];
        vertexOffset += 1;
      }

      const baseVertex = vertexOffset - 4;
      indices[indexOffset] = baseVertex;
      indices[indexOffset + 1] = baseVertex + 1;
      indices[indexOffset + 2] = baseVertex + 2;
      indices[indexOffset + 3] = baseVertex;
      indices[indexOffset + 4] = baseVertex + 2;
      indices[indexOffset + 5] = baseVertex + 3;
      indexOffset += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  return mesh;
}

function topTerrainColorForLayer(terrain: TerrainType | undefined, layerId: string): [number, number, number] {
  if (layerId.toLowerCase().includes("cave")) {
    switch (terrain) {
      case "cave-wall":
        return [0.2, 0.17, 0.15];
      case "water":
      case "deep-water":
        return [0.18, 0.25, 0.3];
      default:
        return [0.36, 0.31, 0.25];
    }
  }

  switch (terrain) {
    case "deep-water":
      return [0.12, 0.34, 0.54];
    case "water":
      return [0.27, 0.59, 0.74];
    case "sand":
      return [0.82, 0.72, 0.48];
    case "forest":
      return [0.27, 0.5, 0.27];
    case "mountain":
      return [0.62, 0.6, 0.52];
    case "road":
      return [0.66, 0.54, 0.36];
    case "cave-floor":
      return [0.42, 0.36, 0.3];
    case "cave-wall":
      return [0.22, 0.18, 0.15];
    case "grass":
    default:
      return [0.53, 0.7, 0.41];
  }
}

function createDioramaBase(meshData: TerrainMeshData, activeLayerId: string): THREE.Group {
  const group = new THREE.Group();
  const isCave = activeLayerId.toLowerCase().includes("cave");
  const slabHeight = 1.2;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(meshData.terrainWidth + 4.2, slabHeight, meshData.terrainDepth + 4.2),
    new THREE.MeshStandardMaterial({
      color: isCave ? 0x2a211d : 0xc6a06c,
      roughness: 0.92,
    }),
  );
  base.position.y = -slabHeight / 2 - 0.28;
  base.receiveShadow = true;
  group.add(base);

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(meshData.terrainWidth + 4.7, 0.32, meshData.terrainDepth + 4.7),
    new THREE.MeshStandardMaterial({
      color: isCave ? 0x3a2c25 : 0x8f6f45,
      roughness: 0.88,
    }),
  );
  rim.position.y = -slabHeight - 0.5;
  rim.receiveShadow = true;
  group.add(rim);
  return group;
}

function updateEntityGroup(
  entityGroup: THREE.Group,
  mapData: MapData,
  entities: readonly WorldEntity[],
  activeLayerId: string,
  meshData: TerrainMeshData,
): void {
  for (const child of entityGroup.children) {
    disposeObject(child);
  }
  entityGroup.clear();

  for (const entity of entities) {
    if (entity.layerId !== activeLayerId) {
      continue;
    }
    const radius = entity.entityType === "player" ? 0.82 : 0.56;
    const position = entityToTerrainPosition(mapData, entity, meshData, radius + 0.22);
    entityGroup.add(createEntityMarker(entity, radius, position));
  }
}

function createStaticMarkerGroup(
  mapData: MapData,
  activeLayerId: string,
  meshData: TerrainMeshData,
  identity: WorldIdentity | null,
): THREE.Group {
  const markerGroup = new THREE.Group();

  if (identity?.base.layerId === activeLayerId) {
    const position = tileToTerrainPosition(mapData, identity.base.x, identity.base.y, meshData, 0.22);
    markerGroup.add(createBaseCoreMarker(position));
  }

  if (identity?.landmark.layerId === activeLayerId) {
    const position = tileToTerrainPosition(mapData, identity.landmark.x, identity.landmark.y, meshData, 0.48);
    const marker = createLandmarkMarker(identity.landmark);
    marker.position.set(position.x, position.y, position.z);
    markerGroup.add(marker);
  }

  const identityLandmark = identity?.landmark;
  for (const poi of identity?.pois ?? []) {
    if (
      poi.layerId !== activeLayerId
      || poi.kind === "core"
      || poi.kind === "landmark"
      || poi.kind === "portal"
      || (identityLandmark !== undefined && poi.x === identityLandmark.x && poi.y === identityLandmark.y)
    ) {
      continue;
    }
    const position = tileToTerrainPosition(mapData, poi.x, poi.y, meshData, 0.42);
    const marker = createPoiMarker(poi);
    marker.position.set(position.x, position.y, position.z);
    markerGroup.add(marker);
  }

  for (const portal of mapData.portalList) {
    if (portal.fromLayerId !== activeLayerId) {
      continue;
    }
    const position = tileToTerrainPosition(mapData, portal.x, portal.y, meshData, 0.46);
    const marker = createPortalMarker(portal.toLayerId);
    marker.position.set(position.x, position.y, position.z);
    markerGroup.add(marker);
  }

  for (const object of mapData.objectList) {
    if (object.layerId !== activeLayerId) {
      continue;
    }
    const position = tileToTerrainPosition(mapData, object.x, object.y, meshData, object.type === "cave-entrance" ? 0.44 : 0.24);
    const marker = createObjectMarker(object.type);
    marker.position.set(position.x, position.y, position.z);
    markerGroup.add(marker);
  }

  return markerGroup;
}

function createPoiMarker(poi: WorldSpecialPoi): THREE.Object3D {
  const group = new THREE.Group();
  const colors = poiColors(poi.kind);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.44, 0.18, 9),
    new THREE.MeshStandardMaterial({ color: colors.base, roughness: 0.84 }),
  );
  base.position.y = 0.1;
  const gem = new THREE.Mesh(
    poi.kind === "pool"
      ? new THREE.SphereGeometry(0.3, 16, 8)
      : new THREE.OctahedronGeometry(0.32, 1),
    new THREE.MeshStandardMaterial({
      color: colors.core,
      emissive: colors.emissive,
      roughness: 0.5,
    }),
  );
  gem.position.y = 0.52;
  const light = new THREE.PointLight(colors.glow, 0.22, 3.5);
  light.position.y = 0.78;
  group.add(base, gem, light);
  return withDioramaShadow(group);
}

function createObjectMarker(type: string): THREE.Object3D {
  if (type === "cave-entrance") {
    const group = new THREE.Group();
    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 16, 10),
      new THREE.MeshStandardMaterial({ color: 0x231927, emissive: 0x130814, roughness: 0.8 }),
    );
    mouth.scale.set(1.25, 0.82, 0.62);
    mouth.position.y = 0.52;
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.09, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xc782ff }),
    );
    arch.rotation.y = -Math.PI / 5;
    arch.position.y = 0.66;
    const glow = new THREE.PointLight(0xc782ff, 0.8, 6);
    glow.position.y = 0.88;
    group.add(mouth, arch, glow);
    return withDioramaShadow(group);
  }
  if (type === "tree") {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.58, 6),
      new THREE.MeshStandardMaterial({ color: 0x7c5631, roughness: 0.9 }),
    );
    trunk.position.y = 0.3;
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, 1.05, 8),
      new THREE.MeshStandardMaterial({ color: 0x245f32, roughness: 0.86 }),
    );
    crown.position.y = 0.95;
    group.add(trunk, crown);
    return withDioramaShadow(group);
  }
  if (type === "rock") {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.46),
      new THREE.MeshStandardMaterial({ color: 0x6b6d66, roughness: 0.94 }),
    );
    rock.position.y = 0.32;
    rock.scale.set(1.1, 0.78, 0.88);
    return withDioramaShadow(rock);
  }
  if (type === "village") {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 0.36, 8),
      new THREE.MeshStandardMaterial({ color: 0xb7824f, roughness: 0.82 }),
    );
    base.position.y = 0.2;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.56, 0.58, 4),
      new THREE.MeshStandardMaterial({ color: 0xd95f45, roughness: 0.78 }),
    );
    roof.position.y = 0.68;
    roof.rotation.y = Math.PI / 4;
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffef9e }),
    );
    beacon.position.y = 1.08;
    group.add(base, roof, beacon);
    return withDioramaShadow(group);
  }
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.18, 8),
    new THREE.MeshStandardMaterial({ color: 0xaa7c47, roughness: 0.84 }),
  );
  marker.position.y = 0.12;
  return withDioramaShadow(marker);
}

function createPortalMarker(toLayerId: string): THREE.Object3D {
  const group = new THREE.Group();
  const color = toLayerId === "cave" ? 0xc782ff : 0x7bd8ff;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.08, 10, 30),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.y = -Math.PI / 4;
  ring.position.y = 0.72;
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22),
    new THREE.MeshBasicMaterial({ color }),
  );
  core.position.y = 0.72;
  const glow = new THREE.PointLight(color, 0.65, 5.5);
  glow.position.y = 0.84;
  group.add(ring, core, glow);
  return group;
}

function createLandmarkMarker(landmark: WorldIdentityLandmark): THREE.Object3D {
  const group = new THREE.Group();
  const colors = landmarkColors(landmark.kind);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.62, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: colors.base, roughness: 0.76 }),
  );
  base.position.y = 0.14;

  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 1),
    new THREE.MeshStandardMaterial({
      color: colors.core,
      emissive: colors.emissive,
      roughness: 0.42,
    }),
  );
  beacon.position.y = 0.78;

  const light = new THREE.PointLight(colors.glow, 0.52, 5);
  light.position.y = 1.08;
  group.add(base, beacon, light);

  if (landmark.kind === "highland-spire") {
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(0.36, 1.1, 5),
      new THREE.MeshStandardMaterial({ color: 0xa9a99e, roughness: 0.82 }),
    );
    spire.position.y = 1.04;
    group.add(spire);
  }

  return withDioramaShadow(group);
}

function createBaseCoreMarker(position: { x: number; y: number; z: number }): THREE.Object3D {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.68, 0.28, 12),
    new THREE.MeshStandardMaterial({ color: 0x7e8f55, roughness: 0.8 }),
  );
  base.position.y = 0.16;
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffdf72,
      emissive: 0x4a3200,
      roughness: 0.46,
    }),
  );
  core.position.y = 0.68;
  const flagPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6),
    new THREE.MeshStandardMaterial({ color: 0x6f5434, roughness: 0.72 }),
  );
  flagPole.position.set(0.42, 0.78, 0);
  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.22, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xff8d5c }),
  );
  flag.position.set(0.62, 1.12, 0);
  const glow = new THREE.PointLight(0xffdf72, 0.45, 4);
  glow.position.y = 1.0;
  group.add(base, core, flagPole, flag, glow);
  group.position.set(position.x, position.y, position.z);
  return withDioramaShadow(group);
}

function landmarkColors(kind: WorldIdentityLandmark["kind"]): { base: number; core: number; emissive: number; glow: number } {
  switch (kind) {
    case "elder-grove":
      return { base: 0x4d7f3e, core: 0x8ed36f, emissive: 0x173b12, glow: 0xc8f2a8 };
    case "cave-beacon":
      return { base: 0x4c3560, core: 0xc782ff, emissive: 0x2d0f45, glow: 0xd7a5ff };
    case "highland-spire":
      return { base: 0x797b72, core: 0xffe6a0, emissive: 0x3c2a00, glow: 0xffe6a0 };
    case "tidewatch":
      return { base: 0x3f8499, core: 0x8ce9ff, emissive: 0x073441, glow: 0x8ce9ff };
    case "pathstone":
      return { base: 0xa37746, core: 0xffcc70, emissive: 0x3d2304, glow: 0xffd98a };
    case "heartstone":
      return { base: 0xa66e45, core: 0xffdf72, emissive: 0x4a3200, glow: 0xffdf72 };
  }
}

function poiColors(kind: WorldSpecialPoi["kind"]): { base: number; core: number; emissive: number; glow: number } {
  switch (kind) {
    case "grove":
      return { base: 0x426d42, core: 0x9fd46f, emissive: 0x173b12, glow: 0xbfe88a };
    case "pool":
      return { base: 0x3d7884, core: 0x8ce9ff, emissive: 0x06313b, glow: 0x9ff3ff };
    case "scar":
      return { base: 0x6b5f55, core: 0xff9a5f, emissive: 0x3c1600, glow: 0xffba7a };
    case "gate":
      return { base: 0x4c3560, core: 0xc782ff, emissive: 0x2d0f45, glow: 0xd7a5ff };
    case "camp":
      return { base: 0x8a643b, core: 0xffd270, emissive: 0x3a2100, glow: 0xffdf8a };
    case "ring":
      return { base: 0x777064, core: 0xffefb0, emissive: 0x302100, glow: 0xffefb0 };
    case "core":
    case "landmark":
    case "portal":
      return { base: 0x6e5741, core: 0xffdf72, emissive: 0x3a2700, glow: 0xffdf72 };
  }
}

function createEntityMarker(
  entity: WorldEntity,
  radius: number,
  position: { x: number; y: number; z: number },
): THREE.Object3D {
  const group = new THREE.Group();
  const isPlayer = entity.entityType === "player";
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 12),
    new THREE.MeshStandardMaterial({
      color: isPlayer ? 0xffdf5d : 0xd65a64,
      emissive: isPlayer ? 0x3a2700 : 0x28060a,
      roughness: 0.56,
    }),
  );
  body.position.y = 0;
  const highlight = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.22, 10, 8),
    new THREE.MeshBasicMaterial({ color: isPlayer ? 0xffffc4 : 0xffb2b8 }),
  );
  highlight.position.set(radius * 0.24, radius * 0.32, -radius * 0.22);
  group.add(body, highlight);
  group.position.set(position.x, position.y, position.z);
  return withDioramaShadow(group);
}

function createCameraControls(viewMode: Terrain3DViewMode, meshData: TerrainMeshData): CameraControlsState {
  const snapshot = defaultCameraSnapshot(viewMode, meshData);
  return {
    mode: viewMode,
    target: snapshot.target,
    distance: snapshot.distance,
    azimuth: snapshot.azimuth,
    polar: snapshot.polar,
    transition: null,
  };
}

function defaultCameraSnapshot(viewMode: Terrain3DViewMode, meshData: TerrainMeshData): CameraSnapshot {
  const maxDimension = cameraMaxDimension(meshData);
  const center = new THREE.Vector3(0, meshData.heightScale * 0.18, 0);
  if (viewMode === "top") {
    return {
      target: center,
      distance: maxDimension * 1.42,
      azimuth: 0,
      polar: 0.001,
    };
  }
  return {
    target: center,
    distance: maxDimension * 1.24,
    azimuth: Math.PI / 4,
    polar: 0.94,
  };
}

function transitionToViewMode(refs: SceneRefs, viewMode: Terrain3DViewMode): void {
  refs.controls.mode = viewMode;
  startCameraTransition(refs, defaultCameraSnapshot(viewMode, refs.meshData), 280);
}

function attachCameraControls(element: HTMLCanvasElement, refs: SceneRefs): () => void {
  element.tabIndex = 0;
  element.setAttribute(
    "aria-label",
    "3D 세계 보기. 탑뷰는 이동과 확대, 자유 시점은 회전을 지원합니다.",
  );

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    element.focus();
    cancelCameraTransition(refs);
    refs.drag = {
      pointerId: event.pointerId,
      previousX: event.clientX,
      previousY: event.clientY,
      action: dragActionForEvent(refs.controls.mode, event),
    };
    element.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!refs.drag || refs.drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - refs.drag.previousX;
    const deltaY = event.clientY - refs.drag.previousY;
    refs.drag.previousX = event.clientX;
    refs.drag.previousY = event.clientY;
    if (refs.drag.action === "rotate") {
      rotateOrbitCamera(refs, deltaX, deltaY);
    } else {
      panCamera(refs, deltaX, deltaY);
    }
    renderWithCamera(refs);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (refs.drag?.pointerId === event.pointerId) {
      refs.drag = null;
    }
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    cancelCameraTransition(refs);
    zoomCamera(refs, event.deltaY);
    renderWithCamera(refs);
  };

  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerUp);
  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("contextmenu", onContextMenu);

  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerUp);
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("contextmenu", onContextMenu);
  };
}

function dragActionForEvent(viewMode: Terrain3DViewMode, event: PointerEvent): CameraDragState["action"] {
  if (viewMode !== "orbit") {
    return "pan";
  }
  return event.button === 1 ? "pan" : "rotate";
}

function rotateOrbitCamera(refs: SceneRefs, deltaX: number, deltaY: number): void {
  if (refs.controls.mode !== "orbit") {
    return;
  }
  refs.controls.azimuth -= deltaX * 0.006;
  refs.controls.polar -= deltaY * 0.004;
}

function panCamera(refs: SceneRefs, deltaX: number, deltaY: number): void {
  refs.camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(refs.camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(refs.camera.matrixWorld, 1);
  const scale = refs.controls.distance * 0.00155;
  refs.controls.target.addScaledVector(right, -deltaX * scale);
  refs.controls.target.addScaledVector(up, deltaY * scale);
  refs.controls.target.y = cameraTargetHeight(refs.meshData);
}

function zoomCamera(refs: SceneRefs, deltaY: number): void {
  refs.controls.distance *= 1 + deltaY * 0.0012;
}

function startCameraTransition(refs: SceneRefs, end: CameraSnapshot, durationMs: number): void {
  cancelCameraTransition(refs);
  refs.controls.transition = {
    start: snapshotFromControls(refs.controls),
    end: cloneCameraSnapshot(end),
    startTime: performance.now(),
    durationMs,
  };

  const step = () => {
    const transition = refs.controls.transition;
    if (!transition) {
      refs.animationFrame = null;
      return;
    }
    const elapsed = performance.now() - transition.startTime;
    const progress = Math.min(1, elapsed / transition.durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    refs.controls.target.lerpVectors(transition.start.target, transition.end.target, eased);
    refs.controls.distance = lerpNumber(transition.start.distance, transition.end.distance, eased);
    refs.controls.azimuth = lerpNumber(transition.start.azimuth, transition.end.azimuth, eased);
    refs.controls.polar = lerpNumber(transition.start.polar, transition.end.polar, eased);
    renderWithCamera(refs);
    if (progress < 1) {
      refs.animationFrame = window.requestAnimationFrame(step);
    } else {
      refs.controls.transition = null;
      refs.animationFrame = null;
    }
  };

  step();
}

function cancelCameraTransition(refs: SceneRefs): void {
  refs.controls.transition = null;
  if (refs.animationFrame !== null) {
    window.cancelAnimationFrame(refs.animationFrame);
    refs.animationFrame = null;
  }
}

function renderWithCamera(refs: SceneRefs): void {
  applyCameraFromControls(refs.camera, refs.controls, refs.meshData);
  applySceneFog(refs.scene, refs.controls.mode, refs.meshData, refs.fogColor);
  applyTerrainMeshVisibility(refs.terrainMesh, refs.topTerrainMesh, refs.controls.mode);
  refs.render();
}

function applyCameraFromControls(
  camera: THREE.PerspectiveCamera,
  controls: CameraControlsState,
  meshData: TerrainMeshData,
): void {
  constrainCameraControls(controls, meshData);
  const maxDimension = cameraMaxDimension(meshData);
  const sinPolar = Math.sin(controls.polar);
  const offset = new THREE.Vector3(
    controls.distance * sinPolar * Math.sin(controls.azimuth),
    controls.distance * Math.cos(controls.polar),
    controls.distance * sinPolar * Math.cos(controls.azimuth),
  );
  camera.near = 0.1;
  camera.far = maxDimension * 8;
  camera.up.set(0, 1, 0);
  if (controls.mode === "top") {
    camera.up.set(0, 0, -1);
  }
  camera.position.copy(controls.target).add(offset);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
}

function constrainCameraControls(controls: CameraControlsState, meshData: TerrainMeshData): void {
  const maxDimension = cameraMaxDimension(meshData);
  const minDistance = Math.max(8, maxDimension * 0.36);
  const maxDistance = Math.max(24, maxDimension * 3.2);
  controls.distance = clampNumber(controls.distance, minDistance, maxDistance);
  controls.target.x = clampNumber(controls.target.x, -meshData.terrainWidth * 0.62, meshData.terrainWidth * 0.62);
  controls.target.y = clampNumber(controls.target.y, -1, meshData.heightScale * 1.3);
  controls.target.z = clampNumber(controls.target.z, -meshData.terrainDepth * 0.62, meshData.terrainDepth * 0.62);
  if (controls.mode === "top") {
    controls.polar = 0.001;
    controls.azimuth = 0;
    controls.target.y = cameraTargetHeight(meshData);
    return;
  }
  controls.polar = clampNumber(controls.polar, 0.32, 1.32);
}

function applySceneFog(scene: THREE.Scene, viewMode: Terrain3DViewMode, meshData: TerrainMeshData, fogColor: number): void {
  if (viewMode === "top") {
    scene.fog = null;
    return;
  }
  scene.fog = new THREE.Fog(fogColor, meshData.terrainWidth * 1.85, meshData.terrainWidth * 4.2);
}

function applyTerrainMeshVisibility(terrainMesh: THREE.Mesh, topTerrainMesh: THREE.Mesh, viewMode: Terrain3DViewMode): void {
  const isTopView = viewMode === "top";
  terrainMesh.visible = !isTopView;
  topTerrainMesh.visible = isTopView;
}

function snapshotFromControls(controls: CameraControlsState): CameraSnapshot {
  return {
    target: controls.target.clone(),
    distance: controls.distance,
    azimuth: controls.azimuth,
    polar: controls.polar,
  };
}

function cloneCameraSnapshot(snapshot: CameraSnapshot): CameraSnapshot {
  return {
    target: snapshot.target.clone(),
    distance: snapshot.distance,
    azimuth: snapshot.azimuth,
    polar: snapshot.polar,
  };
}

function cameraMaxDimension(meshData: TerrainMeshData): number {
  return Math.max(meshData.terrainWidth, meshData.terrainDepth, meshData.heightScale);
}

function cameraTargetHeight(meshData: TerrainMeshData): number {
  return meshData.heightScale * 0.18;
}

function lerpNumber(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function withDioramaShadow<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return object;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) {
      entry.dispose();
    }
    return;
  }
  material.dispose();
}
