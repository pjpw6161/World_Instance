import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import * as THREE from "three";
import type { MapData } from "@world-forge/shared";
import {
  createTerrainMeshData,
  entityToTerrainPosition,
  heightDiffMovementReadiness,
  terrainLayerSceneStyle,
  tileToTerrainPosition,
  type Terrain3DViewMode,
  type TerrainMeshData,
} from "./terrain3d";
import type { WorldEntity } from "./worldState";

interface WorldTerrain3DProps {
  mapData: MapData;
  entities: readonly WorldEntity[];
  activeLayerId: string;
  viewMode: Terrain3DViewMode;
}

interface SceneRefs {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  entityGroup: THREE.Group;
  meshData: TerrainMeshData;
  render: () => void;
}

export type { Terrain3DViewMode };

export function WorldTerrain3D({ mapData, entities, activeLayerId, viewMode }: WorldTerrain3DProps) {
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

    try {
      const meshData = createTerrainMeshData(mapData, { layerId: activeLayerId });
      const sceneStyle = terrainLayerSceneStyle(activeLayerId);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(sceneStyle.backgroundColor);
      scene.fog = new THREE.Fog(sceneStyle.fogColor, meshData.terrainWidth * 0.9, meshData.terrainWidth * 2.4);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const ambientLight = new THREE.HemisphereLight(
        sceneStyle.ambientSkyColor,
        sceneStyle.ambientGroundColor,
        sceneStyle.ambientIntensity,
      );
      const keyLight = new THREE.DirectionalLight(sceneStyle.keyLightColor, sceneStyle.keyLightIntensity);
      keyLight.position.set(36, 48, 32);
      scene.add(ambientLight, keyLight);
      scene.add(createTerrainMesh(meshData));
      scene.add(createStaticMarkerGroup(mapData, activeLayerId, meshData));

      const entityGroup = new THREE.Group();
      scene.add(entityGroup);
      host.appendChild(renderer.domElement);

      const render = () => renderer.render(scene, camera);
      const refs: SceneRefs = {
        camera,
        renderer,
        scene,
        entityGroup,
        meshData,
        render,
      };
      sceneRef.current = refs;

      const resize = () => {
        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        applyCamera(camera, viewModeRef.current, meshData);
        render();
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
      clearScheduledRenderError(renderErrorTimeoutRef);
      const refs = sceneRef.current;
      sceneRef.current = null;
      if (!refs) {
        return;
      }
      disposeObject(refs.scene);
      refs.renderer.dispose();
      refs.renderer.domElement.remove();
    };
  }, [activeLayerId, mapData]);

  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) {
      return;
    }
    updateEntityGroup(refs.entityGroup, mapData, entities, activeLayerId, refs.meshData);
    refs.render();
  }, [activeLayerId, entities, mapData]);

  useEffect(() => {
    viewModeRef.current = viewMode;
    const refs = sceneRef.current;
    if (!refs) {
      return;
    }
    applyCamera(refs.camera, viewMode, refs.meshData);
    refs.render();
  }, [viewMode]);

  return (
    <div ref={hostRef} className="world-terrain-3d" aria-label="3D terrain view">
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
    metalness: 0,
    roughness: 0.96,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = 0;
  return mesh;
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
    const geometry = new THREE.SphereGeometry(radius, 16, 10);
    const material = new THREE.MeshStandardMaterial({
      color: entity.entityType === "player" ? 0xf7e86b : 0xc44d58,
      emissive: entity.entityType === "player" ? 0x302800 : 0x240409,
      roughness: 0.55,
    });
    const sphere = new THREE.Mesh(geometry, material);
    const position = entityToTerrainPosition(mapData, entity, meshData, radius + 0.22);
    sphere.position.set(position.x, position.y, position.z);
    entityGroup.add(createMovementRing(mapData, entity, meshData, position, radius));
    entityGroup.add(sphere);
  }
}

function createStaticMarkerGroup(mapData: MapData, activeLayerId: string, meshData: TerrainMeshData): THREE.Group {
  const markerGroup = new THREE.Group();

  for (const portal of mapData.portalList) {
    if (portal.fromLayerId !== activeLayerId) {
      continue;
    }
    const position = tileToTerrainPosition(mapData, portal.x, portal.y, meshData, 0.42);
    const geometry = new THREE.TorusGeometry(0.74, 0.08, 8, 24);
    const material = new THREE.MeshBasicMaterial({
      color: portal.toLayerId === "cave" ? 0xb96df2 : 0x66c8ff,
      transparent: true,
      opacity: 0.88,
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.rotation.x = Math.PI / 2;
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

function createObjectMarker(type: string): THREE.Mesh {
  if (type === "cave-entrance") {
    const geometry = new THREE.SphereGeometry(0.52, 12, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0x7d4aa2 });
    return new THREE.Mesh(geometry, material);
  }
  if (type === "tree") {
    const geometry = new THREE.ConeGeometry(0.46, 0.96, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x163f2a, roughness: 0.8 });
    return new THREE.Mesh(geometry, material);
  }
  if (type === "rock") {
    const geometry = new THREE.DodecahedronGeometry(0.42);
    const material = new THREE.MeshStandardMaterial({ color: 0x4c514f, roughness: 0.9 });
    return new THREE.Mesh(geometry, material);
  }
  const geometry = new THREE.BoxGeometry(0.52, 0.52, 0.52);
  const material = new THREE.MeshStandardMaterial({ color: 0x7f6342, roughness: 0.8 });
  return new THREE.Mesh(geometry, material);
}

function createMovementRing(
  mapData: MapData,
  entity: WorldEntity,
  meshData: TerrainMeshData,
  position: { x: number; y: number; z: number },
  radius: number,
): THREE.Mesh {
  const readiness = heightDiffMovementReadiness(mapData, entity);
  const color = readiness.reachableDirections > 0 ? 0x54b36a : 0xb84d4d;
  const geometry = new THREE.TorusGeometry(radius * 1.28, 0.045, 6, 28);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.82,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(position.x, position.y - radius - 0.12, position.z);
  ring.scale.z = Math.max(0.5, meshData.terrainDepth / Math.max(1, meshData.terrainWidth));
  return ring;
}

function applyCamera(camera: THREE.PerspectiveCamera, viewMode: Terrain3DViewMode, meshData: TerrainMeshData): void {
  const maxDimension = Math.max(meshData.terrainWidth, meshData.terrainDepth, meshData.heightScale);
  camera.near = 0.1;
  camera.far = maxDimension * 8;
  camera.up.set(0, 1, 0);

  if (viewMode === "top") {
    camera.position.set(0, maxDimension * 1.25, 0.01);
    camera.up.set(0, 0, -1);
  } else if (viewMode === "side") {
    camera.position.set(0, maxDimension * 0.42, maxDimension * 1.25);
  } else {
    camera.position.set(maxDimension * 0.72, maxDimension * 0.64, maxDimension * 0.88);
  }

  camera.lookAt(0, meshData.heightScale * 0.2, 0);
  camera.updateProjectionMatrix();
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
