import type { MapData, MapObject, ObjectType, Portal, TerrainType } from "@world-forge/shared";
import type {
  WorldCrest,
  WorldIdentity,
  WorldIdentityBadge,
  WorldIdentityLandmark,
  WorldIdentityPoint,
  WorldRegionLabel,
  WorldSpecialPoi,
} from "./worldIdentity";
import type { WorldEntity } from "./worldState";

export type WorldMapViewMode = "styled" | "debug";

export interface WorldMapAnnotationHit {
  label: string;
  detail: string;
  screenX: number;
  screenY: number;
}

interface DirectionSet {
  north: boolean;
  south: boolean;
  west: boolean;
  east: boolean;
}

interface StyledMapLayout {
  width: number;
  height: number;
  tileSize: number;
  margin: number;
  headerHeight: number;
  mapX: number;
  mapY: number;
  mapWidth: number;
  mapHeight: number;
  panelX: number;
  panelY: number;
  panelWidth: number;
  panelHeight: number;
}

interface MapAnnotation {
  id: string;
  label: string;
  shortLabel: string;
  detail: string;
  tone: string;
  priority: number;
  x: number;
  y: number;
  layerId: string;
}

interface PlacedAnnotation {
  annotation: MapAnnotation;
  screenX: number;
  screenY: number;
  hidden: boolean;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const debugTerrainColors: Record<TerrainType, string> = {
  "deep-water": "#1b4876",
  water: "#3174a8",
  sand: "#d5be80",
  grass: "#6b9654",
  forest: "#32663f",
  mountain: "#7c796f",
  road: "#967c52",
  "cave-floor": "#564c42",
  "cave-wall": "#2a2522",
};

const styledTerrainColors: Record<TerrainType, string> = {
  "deep-water": "#285f89",
  water: "#4f91b6",
  sand: "#d9c58f",
  grass: "#88b66f",
  forest: "#336f47",
  mountain: "#8f9189",
  road: "#ad8b58",
  "cave-floor": "#5f554b",
  "cave-wall": "#292622",
};

const waterTerrains = new Set<TerrainType>(["deep-water", "water"]);
const roadObjectTypes = new Set<ObjectType>(["road-node"]);

export function renderWorldMap(
  canvas: HTMLCanvasElement,
  mapData: MapData,
  entities: readonly WorldEntity[],
  activeLayerId: string,
  mode: WorldMapViewMode,
  identity: WorldIdentity | null = null,
): void {
  if (mode === "debug") {
    drawDebugWorld(canvas, mapData, entities, activeLayerId, identity);
    return;
  }
  drawStyledWorld(canvas, mapData, entities, activeLayerId, identity);
}

export function styledTileSize(mapData: Pick<MapData, "width" | "height">): number {
  const maxDimension = Math.max(mapData.width, mapData.height);
  if (maxDimension <= 0) {
    return 4;
  }
  return clampInteger(Math.floor(1280 / maxDimension), 2, 10);
}

export function isShorelineTile(mapData: MapData, x: number, y: number): boolean {
  const terrain = terrainAt(mapData, x, y);
  if (!terrain || waterTerrains.has(terrain) || terrain === "cave-wall" || terrain === "cave-floor") {
    return false;
  }
  return adjacentTiles(x, y).some(([nextX, nextY]) => {
    const neighborTerrain = terrainAt(mapData, nextX, nextY);
    return neighborTerrain ? waterTerrains.has(neighborTerrain) : false;
  });
}

export function roadConnections(mapData: MapData, x: number, y: number): DirectionSet {
  return {
    north: isRoadTile(mapData, x, y - 1),
    south: isRoadTile(mapData, x, y + 1),
    west: isRoadTile(mapData, x - 1, y),
    east: isRoadTile(mapData, x + 1, y),
  };
}

export function hitTestWorldMapAnnotation(
  mapData: MapData,
  activeLayerId: string,
  identity: WorldIdentity | null,
  canvasX: number,
  canvasY: number,
): WorldMapAnnotationHit | null {
  if (!identity || !Number.isFinite(canvasX) || !Number.isFinite(canvasY)) {
    return null;
  }
  const layout = styledMapLayout(mapData, identity);
  const annotations = placeAnnotations(layout, buildMapAnnotations(identity, mapData.portalList, activeLayerId));
  for (const placed of annotations) {
    const radius = placed.annotation.priority <= 2 ? 16 : 13;
    const distance = Math.hypot(canvasX - placed.screenX, canvasY - placed.screenY);
    if (distance <= radius) {
      return {
        label: placed.annotation.label,
        detail: placed.annotation.detail,
        screenX: placed.screenX,
        screenY: placed.screenY,
      };
    }
  }
  return null;
}

function drawDebugWorld(
  canvas: HTMLCanvasElement,
  mapData: MapData,
  entities: readonly WorldEntity[],
  activeLayerId: string,
  identity: WorldIdentity | null,
): void {
  canvas.width = mapData.width;
  canvas.height = mapData.height;
  const context = context2d(canvas);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = false;

  for (let index = 0; index < mapData.terrainMap.length; index += 1) {
    const x = index % mapData.width;
    const y = Math.floor(index / mapData.width);
    context.fillStyle = debugTerrainColors[mapData.terrainMap[index]];
    context.fillRect(x, y, 1, 1);
  }

  for (const portal of mapData.portalList) {
    if (portal.fromLayerId !== activeLayerId) {
      continue;
    }
    context.fillStyle = portal.toLayerId === "cave" ? "#b96df2" : "#66c8ff";
    context.beginPath();
    context.moveTo(portal.x + 0.5, portal.y - 1.5);
    context.lineTo(portal.x + 2.5, portal.y + 0.5);
    context.lineTo(portal.x + 0.5, portal.y + 2.5);
    context.lineTo(portal.x - 1.5, portal.y + 0.5);
    context.closePath();
    context.fill();
    context.strokeStyle = "#1f2b27";
    context.lineWidth = 0.45;
    context.stroke();
  }

  for (const object of mapData.objectList) {
    if (object.layerId !== activeLayerId) {
      continue;
    }
    context.fillStyle = debugObjectColor(object.type);
    context.beginPath();
    if (object.type === "cave-entrance") {
      context.arc(object.x + 0.5, object.y + 0.5, 2.1, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#f4d6ff";
      context.lineWidth = 0.35;
      context.stroke();
    } else {
      context.fillRect(object.x - 1, object.y - 1, 3, 3);
    }
  }

  if (identity) {
    drawDebugIdentity(context, identity, activeLayerId);
  }
  drawDebugEntities(context, entities, activeLayerId);
}

function drawStyledWorld(
  canvas: HTMLCanvasElement,
  mapData: MapData,
  entities: readonly WorldEntity[],
  activeLayerId: string,
  identity: WorldIdentity | null,
): void {
  const layout = styledMapLayout(mapData, identity);
  canvas.width = layout.width;
  canvas.height = layout.height;

  const context = context2d(canvas);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = true;
  context.clearRect(0, 0, layout.width, layout.height);

  drawJournalBackground(context, layout);
  drawStyledHeader(context, layout, identity, activeLayerId);

  context.save();
  context.translate(layout.mapX, layout.mapY);
  context.scale(layout.tileSize, layout.tileSize);
  context.beginPath();
  context.rect(0, 0, mapData.width, mapData.height);
  context.clip();
  context.imageSmoothingEnabled = true;
  context.clearRect(0, 0, mapData.width, mapData.height);

  drawStyledTerrain(context, mapData, activeLayerId);
  if (identity) {
    drawRegionAuras(context, identity.regions, activeLayerId);
  }
  drawShorelines(context, mapData);
  drawRoads(context, mapData, activeLayerId);
  drawLandmarks(context, mapData, activeLayerId);
  if (identity) {
    drawIdentityMarkers(context, identity, activeLayerId);
    drawSpecialPois(context, identity.pois, activeLayerId);
  }
  drawPortals(context, mapData.portalList, activeLayerId);
  context.restore();

  drawMapBorder(context, layout);
  if (identity) {
    const regionLabels = placeRegionLabels(layout, identity.regions, activeLayerId);
    const annotations = placeAnnotations(layout, buildMapAnnotations(identity, mapData.portalList, activeLayerId));
    drawRegionLabels(context, regionLabels);
    drawAnnotationPins(context, annotations);
    drawStyledEntityMarkers(context, layout, entities, activeLayerId);
    drawInfoPanel(context, layout, identity, annotations);
  } else {
    drawStyledEntityMarkers(context, layout, entities, activeLayerId);
    drawEmptyInfoPanel(context, layout);
  }
}

function styledMapLayout(mapData: MapData, identity: WorldIdentity | null): StyledMapLayout {
  const tileSize = styledTileSize(mapData);
  const mapWidth = Math.max(1, mapData.width * tileSize);
  const mapHeight = Math.max(1, mapData.height * tileSize);
  const margin = clampInteger(Math.round(Math.min(mapWidth, mapHeight) * 0.035), 20, 34);
  const headerHeight = identity ? 132 : 96;
  const panelWidth = identity ? clampInteger(Math.round(mapWidth * 0.24), 250, 320) : 220;
  const gap = 22;

  return {
    width: margin + mapWidth + gap + panelWidth + margin,
    height: headerHeight + mapHeight + margin * 2,
    tileSize,
    margin,
    headerHeight,
    mapX: margin,
    mapY: headerHeight + margin,
    mapWidth,
    mapHeight,
    panelX: margin + mapWidth + gap,
    panelY: headerHeight + margin,
    panelWidth,
    panelHeight: mapHeight,
  };
}

function drawJournalBackground(context: CanvasRenderingContext2D, layout: StyledMapLayout): void {
  const gradient = context.createLinearGradient(0, 0, layout.width, layout.height);
  gradient.addColorStop(0, "#f7edcf");
  gradient.addColorStop(0.55, "#efe0b9");
  gradient.addColorStop(1, "#e5d0a0");
  context.fillStyle = gradient;
  context.fillRect(0, 0, layout.width, layout.height);

  context.fillStyle = "rgba(112, 82, 43, 0.055)";
  for (let y = 12; y < layout.height; y += 19) {
    for (let x = 14; x < layout.width; x += 23) {
      if (tileHash(x, y) % 5 === 0) {
        context.fillRect(x, y, 1, 1);
      }
    }
  }

  context.strokeStyle = "rgba(95, 64, 31, 0.32)";
  context.lineWidth = 2;
  strokeRoundedRect(context, 10, 10, layout.width - 20, layout.height - 20, 16);
  context.strokeStyle = "rgba(255, 255, 240, 0.58)";
  context.lineWidth = 1;
  strokeRoundedRect(context, 16, 16, layout.width - 32, layout.height - 32, 12);
}

function drawStyledHeader(
  context: CanvasRenderingContext2D,
  layout: StyledMapLayout,
  identity: WorldIdentity | null,
  activeLayerId: string,
): void {
  const titleX = identity ? layout.margin + 96 : layout.margin;
  const titleY = 36;
  if (identity) {
    drawWorldCrest(context, identity.crest, layout.margin, 24, 74);
  }

  context.fillStyle = "#392c22";
  context.font = '800 28px Georgia, "Times New Roman", serif';
  context.textBaseline = "top";
  context.fillText(identity?.suggestedName ?? "살아 있는 세계 지도", titleX, titleY);

  context.fillStyle = "#755f3e";
  context.font = "700 12px system-ui, sans-serif";
  context.fillText(`판타지 지역 아틀라스 - ${activeLayerId}`, titleX, titleY + 36);

  if (identity) {
    let badgeX = titleX;
    const badgeY = titleY + 61;
    for (const badge of identity.badges.slice(0, 4)) {
      const width = drawBadgePill(context, badge, badgeX, badgeY);
      badgeX += width + 8;
    }
  }

  context.strokeStyle = "rgba(111, 79, 39, 0.22)";
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(layout.margin, layout.headerHeight - 1);
  context.lineTo(layout.width - layout.margin, layout.headerHeight - 1);
  context.stroke();
}

function drawWorldCrest(context: CanvasRenderingContext2D, crest: WorldCrest, x: number, y: number, size: number): void {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  context.save();
  context.shadowColor = "rgba(52, 34, 18, 0.24)";
  context.shadowBlur = 8;
  context.shadowOffsetY = 3;

  context.fillStyle = "#fff3c9";
  context.strokeStyle = "rgba(86, 55, 26, 0.58)";
  context.lineWidth = 2;
  shieldPath(context, x + 4, y + 2, size - 8, size - 6);
  context.fill();
  context.stroke();

  context.shadowColor = "transparent";
  context.fillStyle = crest.primaryColor;
  shieldPath(context, x + 10, y + 8, size - 20, size - 18);
  context.fill();

  context.save();
  shieldPath(context, x + 10, y + 8, size - 20, size - 18);
  context.clip();
  context.fillStyle = crest.secondaryColor;
  for (let index = 0; index < crest.stripeCount; index += 1) {
    const stripeX = x + 8 + index * (size / Math.max(2, crest.stripeCount));
    context.save();
    context.translate(stripeX, y);
    context.rotate(-0.34);
    context.fillRect(-size * 0.1, 0, size * 0.16, size);
    context.restore();
  }
  context.restore();

  context.strokeStyle = crest.accentColor;
  context.lineWidth = 1.4;
  for (let ring = 0; ring < crest.ringCount; ring += 1) {
    context.beginPath();
    context.arc(centerX, centerY - 1, size * (0.18 + ring * 0.055), 0, Math.PI * 2);
    context.stroke();
  }

  context.fillStyle = crest.accentColor;
  context.strokeStyle = "#2e241d";
  context.lineWidth = 1.3;
  drawCrestMotif(context, crest, centerX, centerY, size);
  context.restore();
}

function drawCrestMotif(context: CanvasRenderingContext2D, crest: WorldCrest, centerX: number, centerY: number, size: number): void {
  switch (crest.motif) {
    case "leaf":
      context.beginPath();
      context.ellipse(centerX - size * 0.08, centerY, size * 0.12, size * 0.26, -0.6, 0, Math.PI * 2);
      context.ellipse(centerX + size * 0.1, centerY - size * 0.02, size * 0.12, size * 0.24, 0.62, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(centerX, centerY + size * 0.22);
      context.lineTo(centerX, centerY - size * 0.22);
      context.stroke();
      break;
    case "cave":
      context.beginPath();
      context.arc(centerX, centerY + size * 0.1, size * 0.23, Math.PI, 0);
      context.lineTo(centerX + size * 0.23, centerY + size * 0.23);
      context.lineTo(centerX - size * 0.23, centerY + size * 0.23);
      context.closePath();
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(centerX - size * 0.12, centerY - size * 0.24);
      context.lineTo(centerX - size * 0.03, centerY - size * 0.04);
      context.lineTo(centerX - size * 0.12, centerY + size * 0.1);
      context.stroke();
      break;
    case "wave":
      context.beginPath();
      context.moveTo(centerX - size * 0.26, centerY);
      context.quadraticCurveTo(centerX - size * 0.11, centerY - size * 0.18, centerX + size * 0.02, centerY);
      context.quadraticCurveTo(centerX + size * 0.14, centerY + size * 0.18, centerX + size * 0.28, centerY);
      context.stroke();
      context.beginPath();
      context.moveTo(centerX - size * 0.2, centerY + size * 0.13);
      context.quadraticCurveTo(centerX - size * 0.05, centerY, centerX + size * 0.1, centerY + size * 0.13);
      context.stroke();
      break;
    case "portal":
      context.beginPath();
      context.arc(centerX, centerY, size * 0.19, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(centerX, centerY, size * 0.08, 0, Math.PI * 2);
      context.fill();
      break;
    case "mountain":
      context.beginPath();
      context.moveTo(centerX - size * 0.28, centerY + size * 0.22);
      context.lineTo(centerX - size * 0.04, centerY - size * 0.2);
      context.lineTo(centerX + size * 0.18, centerY + size * 0.22);
      context.closePath();
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(centerX - size * 0.02, centerY + size * 0.22);
      context.lineTo(centerX + size * 0.14, centerY - size * 0.08);
      context.lineTo(centerX + size * 0.31, centerY + size * 0.22);
      context.closePath();
      context.fill();
      context.stroke();
      break;
    case "core":
      context.save();
      context.translate(centerX, centerY);
      context.rotate(Math.PI / 4);
      context.fillRect(-size * 0.15, -size * 0.15, size * 0.3, size * 0.3);
      context.strokeRect(-size * 0.15, -size * 0.15, size * 0.3, size * 0.3);
      context.restore();
      break;
  }
}

function drawBadgePill(context: CanvasRenderingContext2D, badge: WorldIdentityBadge, x: number, y: number): number {
  context.font = "800 12px system-ui, sans-serif";
  const textWidth = context.measureText(badge.label).width;
  const width = Math.max(70, textWidth + 22);
  context.fillStyle = badgeFill(badge.tone);
  context.strokeStyle = "rgba(58, 45, 31, 0.24)";
  context.lineWidth = 1;
  fillRoundedRect(context, x, y, width, 25, 12);
  context.stroke();
  context.fillStyle = "#2f2b22";
  context.textBaseline = "middle";
  context.fillText(badge.label, x + 11, y + 13);
  return width;
}

function drawMapBorder(context: CanvasRenderingContext2D, layout: StyledMapLayout): void {
  context.save();
  context.shadowColor = "rgba(55, 37, 20, 0.28)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 7;
  context.strokeStyle = "#5a422c";
  context.lineWidth = 3;
  strokeRoundedRect(context, layout.mapX - 4, layout.mapY - 4, layout.mapWidth + 8, layout.mapHeight + 8, 12);
  context.shadowColor = "transparent";
  context.strokeStyle = "rgba(255, 250, 225, 0.72)";
  context.lineWidth = 1.2;
  strokeRoundedRect(context, layout.mapX + 3, layout.mapY + 3, layout.mapWidth - 6, layout.mapHeight - 6, 6);
  context.restore();

  drawCompassRose(context, layout.mapX + layout.mapWidth - 42, layout.mapY + 42);
}

function drawCompassRose(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.save();
  context.fillStyle = "rgba(255, 248, 217, 0.72)";
  context.strokeStyle = "rgba(73, 50, 29, 0.42)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, 20, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#5b412b";
  context.beginPath();
  context.moveTo(x, y - 16);
  context.lineTo(x + 5, y + 4);
  context.lineTo(x, y + 1);
  context.lineTo(x - 5, y + 4);
  context.closePath();
  context.fill();
  context.font = "800 10px Georgia, serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("N", x, y - 24);
  context.restore();
}

function placeRegionLabels(
  layout: StyledMapLayout,
  regions: readonly WorldRegionLabel[],
  activeLayerId: string,
): Array<{ region: WorldRegionLabel; screenX: number; screenY: number }> {
  const placed: Array<{ region: WorldRegionLabel; screenX: number; screenY: number; rect: Rect }> = [];
  for (const region of regions.slice(0, 4)) {
    if (region.layerId !== activeLayerId) {
      continue;
    }
    const screenX = clampNumber(layout.mapX + (region.x + 0.5) * layout.tileSize, layout.mapX + 68, layout.mapX + layout.mapWidth - 68);
    const screenY = clampNumber(layout.mapY + (region.y + 0.5) * layout.tileSize, layout.mapY + 36, layout.mapY + layout.mapHeight - 36);
    const width = Math.max(92, region.label.length * 8.2 + 24);
    const rect = { x: screenX - width / 2, y: screenY - 15, width, height: 30 };
    if (placed.some((candidate) => rectsOverlap(candidate.rect, rect))) {
      continue;
    }
    placed.push({ region, screenX, screenY, rect });
  }
  return placed.map(({ region, screenX, screenY }) => ({ region, screenX, screenY }));
}

function drawRegionLabels(
  context: CanvasRenderingContext2D,
  labels: Array<{ region: WorldRegionLabel; screenX: number; screenY: number }>,
): void {
  context.save();
  context.font = '800 14px Georgia, "Times New Roman", serif';
  context.textBaseline = "middle";
  context.textAlign = "center";
  for (const { region, screenX, screenY } of labels) {
    const textWidth = context.measureText(region.label).width;
    context.strokeStyle = "rgba(248, 238, 203, 0.82)";
    context.lineWidth = 4;
    context.strokeText(region.label, screenX, screenY);
    context.fillStyle = toneInk(region.tone);
    context.fillText(region.label, screenX, screenY);
    context.strokeStyle = "rgba(58, 42, 28, 0.28)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(screenX - textWidth * 0.42, screenY + 11);
    context.lineTo(screenX + textWidth * 0.42, screenY + 11);
    context.stroke();
  }
  context.restore();
}

function buildMapAnnotations(
  identity: WorldIdentity,
  portals: readonly Portal[],
  activeLayerId: string,
): MapAnnotation[] {
  const annotations: MapAnnotation[] = [
    {
      id: "annotation-core",
      label: "던전 코어",
      shortLabel: "C",
      detail: "The owned heart of this world.",
      tone: "core",
      priority: 1,
      x: identity.core.x,
      y: identity.core.y,
      layerId: identity.core.layerId,
    },
    {
      id: "annotation-landmark",
      label: identity.landmark.label,
      shortLabel: "L",
      detail: identity.landmark.description,
      tone: "landmark",
      priority: 2,
      x: identity.landmark.x,
      y: identity.landmark.y,
      layerId: identity.landmark.layerId,
    },
  ];

  for (const poi of identity.pois) {
    if (poi.kind === "core" || poi.kind === "landmark") {
      continue;
    }
    annotations.push({
      id: `annotation-${poi.id}`,
      label: poi.label,
      shortLabel: shortLabelForPoi(poi),
      detail: poi.description,
      tone: poi.tone,
      priority: poi.priority,
      x: poi.x,
      y: poi.y,
      layerId: poi.layerId,
    });
  }

  for (const portal of portals.filter((candidate) => candidate.fromLayerId === activeLayerId).slice(0, 2)) {
    annotations.push({
      id: `annotation-portal-${portal.id}`,
      label: "문",
      shortLabel: "P",
      detail: `${portal.toLayerId} 층으로 이어지는 길`,
      tone: "portal",
      priority: 3,
      x: portal.x,
      y: portal.y,
      layerId: portal.fromLayerId,
    });
  }

  const seen = new Set<string>();
  return annotations
    .filter((annotation) => annotation.layerId === activeLayerId)
    .sort((left, right) => left.priority - right.priority)
    .filter((annotation) => {
      const key = `${annotation.layerId}:${annotation.x}:${annotation.y}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function placeAnnotations(layout: StyledMapLayout, annotations: readonly MapAnnotation[]): PlacedAnnotation[] {
  const placed: PlacedAnnotation[] = [];
  const occupied: Rect[] = [];
  const offsets = [
    [0, 0],
    [18, -18],
    [-18, -18],
    [22, 18],
    [-22, 18],
    [0, -30],
    [0, 30],
  ] as const;

  for (const annotation of annotations) {
    let placedAnnotation: PlacedAnnotation | null = null;
    const baseX = layout.mapX + (annotation.x + 0.5) * layout.tileSize;
    const baseY = layout.mapY + (annotation.y + 0.5) * layout.tileSize;
    for (const [offsetX, offsetY] of offsets) {
      const screenX = clampNumber(baseX + offsetX, layout.mapX + 18, layout.mapX + layout.mapWidth - 18);
      const screenY = clampNumber(baseY + offsetY, layout.mapY + 18, layout.mapY + layout.mapHeight - 18);
      const rect = { x: screenX - 14, y: screenY - 14, width: 28, height: 28 };
      if (occupied.some((candidate) => rectsOverlap(candidate, rect))) {
        continue;
      }
      occupied.push(rect);
      placedAnnotation = { annotation, screenX, screenY, hidden: false };
      break;
    }
    if (placedAnnotation) {
      placed.push(placedAnnotation);
    } else if (annotation.priority <= 2) {
      placed.push({ annotation, screenX: baseX, screenY: baseY, hidden: false });
    } else {
      placed.push({ annotation, screenX: baseX, screenY: baseY, hidden: true });
    }
  }

  return placed.filter((annotation) => !annotation.hidden).slice(0, 7);
}

function drawAnnotationPins(
  context: CanvasRenderingContext2D,
  annotations: readonly PlacedAnnotation[],
): void {
  context.save();
  context.font = "900 11px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const placed of annotations) {
    const { annotation, screenX, screenY } = placed;
    context.save();
    context.translate(screenX, screenY);
    context.fillStyle = annotationFill(annotation.tone);
    context.strokeStyle = annotationStroke(annotation.tone);
    context.lineWidth = 1.5;
    context.shadowColor = "rgba(42, 26, 12, 0.25)";
    context.shadowBlur = 6;
    context.shadowOffsetY = 2;
    context.beginPath();
    context.arc(0, 0, annotation.priority <= 2 ? 12 : 9.5, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = "transparent";
    context.stroke();
    context.fillStyle = "#2f261f";
    context.fillText(annotation.shortLabel, 0, 0.5);
    context.restore();
  }
  context.restore();
}

function drawInfoPanel(
  context: CanvasRenderingContext2D,
  layout: StyledMapLayout,
  identity: WorldIdentity,
  annotations: readonly PlacedAnnotation[],
): void {
  drawPanelBase(context, layout);
  let y = layout.panelY + 22;
  context.fillStyle = "#392c22";
  context.font = '800 18px Georgia, "Times New Roman", serif';
  context.textBaseline = "top";
  context.fillText("세계 장부", layout.panelX + 18, y);
  y += 34;

  y = drawPanelEntry(context, layout, y, "던전 코어", `${identity.core.x}, ${identity.core.y}`, "세계의 중심 좌표");
  y = drawPanelEntry(context, layout, y, "이름 붙은 지역", String(identity.regions.length), identity.regions.map((region) => region.label).join(", "));
  y = drawPanelEntry(context, layout, y, "생명체", String(identity.livingStats.creatureCount), `${Math.round(identity.livingStats.reachableAreaRatio * 100)}% 탐험 가능`);

  context.strokeStyle = "rgba(93, 67, 38, 0.22)";
  context.beginPath();
  context.moveTo(layout.panelX + 18, y + 6);
  context.lineTo(layout.panelX + layout.panelWidth - 18, y + 6);
  context.stroke();
  y += 22;

  context.fillStyle = "#5d452d";
  context.font = "800 11px system-ui, sans-serif";
  context.fillText("특별한 장소", layout.panelX + 18, y);
  y += 22;
  for (const poi of identity.pois.slice(0, 5)) {
    y = drawPoiLegend(context, layout, y, poi);
  }

  context.strokeStyle = "rgba(93, 67, 38, 0.22)";
  context.beginPath();
  context.moveTo(layout.panelX + 18, y + 4);
  context.lineTo(layout.panelX + layout.panelWidth - 18, y + 4);
  context.stroke();
  y += 18;

  context.fillStyle = "#5d452d";
  context.font = "800 11px system-ui, sans-serif";
  context.fillText("아틀라스 표식", layout.panelX + 18, y);
  y += 22;
  for (const placed of annotations.slice(0, 5)) {
    y = drawAnnotationLegend(context, layout, y, placed.annotation);
  }
}

function drawEmptyInfoPanel(context: CanvasRenderingContext2D, layout: StyledMapLayout): void {
  drawPanelBase(context, layout);
  context.fillStyle = "#5d452d";
  context.font = '800 18px Georgia, "Times New Roman", serif';
  context.textBaseline = "top";
  context.fillText("세계 장부", layout.panelX + 18, layout.panelY + 22);
  context.font = "700 12px system-ui, sans-serif";
  context.fillText("세계 정체성 기록을 불러오는 중입니다.", layout.panelX + 18, layout.panelY + 58);
}

function drawPanelBase(context: CanvasRenderingContext2D, layout: StyledMapLayout): void {
  context.fillStyle = "rgba(255, 246, 216, 0.78)";
  context.strokeStyle = "rgba(82, 58, 32, 0.32)";
  context.lineWidth = 1.5;
  fillRoundedRect(context, layout.panelX, layout.panelY, layout.panelWidth, layout.panelHeight, 14);
  context.stroke();
}

function drawPanelEntry(
  context: CanvasRenderingContext2D,
  layout: StyledMapLayout,
  y: number,
  label: string,
  value: string,
  detail: string,
): number {
  const x = layout.panelX + 18;
  const width = layout.panelWidth - 36;
  context.fillStyle = "#7a6649";
  context.font = "800 10px system-ui, sans-serif";
  context.textBaseline = "top";
  context.fillText(label.toUpperCase(), x, y);
  context.fillStyle = "#2f281f";
  context.font = '800 15px Georgia, "Times New Roman", serif';
  context.fillText(value, x, y + 16);
  context.fillStyle = "#6b5a43";
  context.font = "700 11px system-ui, sans-serif";
  const nextY = drawWrappedText(context, detail, x, y + 38, width, 15);
  return nextY + 14;
}

function drawPoiLegend(context: CanvasRenderingContext2D, layout: StyledMapLayout, y: number, poi: WorldSpecialPoi): number {
  const x = layout.panelX + 18;
  const width = layout.panelWidth - 36;
  context.fillStyle = badgeFill(poi.tone);
  context.strokeStyle = annotationStroke(poi.tone);
  context.lineWidth = 1;
  fillRoundedRect(context, x, y, width, 34, 8);
  context.stroke();
  context.fillStyle = "#332a21";
  context.font = "800 11px system-ui, sans-serif";
  context.textBaseline = "top";
  context.fillText(poi.label, x + 10, y + 6);
  context.fillStyle = "#6b5a43";
  context.font = "700 10px system-ui, sans-serif";
  context.fillText(`${poi.x}, ${poi.y}`, x + 10, y + 20);
  return y + 42;
}

function drawAnnotationLegend(context: CanvasRenderingContext2D, layout: StyledMapLayout, y: number, annotation: MapAnnotation): number {
  const x = layout.panelX + 18;
  const width = layout.panelWidth - 36;
  context.fillStyle = "rgba(255, 248, 224, 0.68)";
  context.strokeStyle = "rgba(82, 58, 32, 0.18)";
  context.lineWidth = 1;
  fillRoundedRect(context, x, y, width, 30, 7);
  context.stroke();
  context.fillStyle = annotationFill(annotation.tone);
  context.strokeStyle = annotationStroke(annotation.tone);
  context.beginPath();
  context.arc(x + 14, y + 15, 8, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#3b3026";
  context.font = "800 10px system-ui, sans-serif";
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillText(annotation.shortLabel, x + 14, y + 15);
  context.textAlign = "start";
  context.font = "800 11px system-ui, sans-serif";
  context.fillText(annotation.label, x + 30, y + 10);
  return y + 36;
}

function drawRegionAuras(context: CanvasRenderingContext2D, regions: readonly WorldRegionLabel[], activeLayerId: string): void {
  context.save();
  for (const region of regions) {
    if (region.layerId !== activeLayerId) {
      continue;
    }
    const x = region.x + 0.5;
    const y = region.y + 0.5;
    const radius = Math.max(3.5, region.radius);
    const gradient = context.createRadialGradient(x, y, 0.8, x, y, radius);
    gradient.addColorStop(0, regionAuraColor(region.tone, 0.26));
    gradient.addColorStop(1, regionAuraColor(region.tone, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(x, y, radius * 1.25, radius * 0.82, 0, 0, Math.PI * 2);
    context.fill();
    drawRegionDecoration(context, region, radius);
  }
  context.restore();
}

function drawRegionDecoration(context: CanvasRenderingContext2D, region: WorldRegionLabel, radius: number): void {
  context.save();
  context.strokeStyle = regionAuraColor(region.tone, 0.44);
  context.fillStyle = regionAuraColor(region.tone, 0.48);
  context.lineWidth = 0.12;
  const count = clampInteger(Math.round(radius / 2), 2, 6);
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + (tileHash(region.x, region.y) % 9) * 0.04;
    const x = region.x + 0.5 + Math.cos(angle) * radius * 0.48;
    const y = region.y + 0.5 + Math.sin(angle) * radius * 0.32;
    switch (region.tone) {
      case "forest":
        context.beginPath();
        context.ellipse(x, y, 0.32, 0.18, angle, 0, Math.PI * 2);
        context.fill();
        break;
      case "highland":
        context.beginPath();
        context.moveTo(x - 0.28, y + 0.22);
        context.lineTo(x, y - 0.28);
        context.lineTo(x + 0.3, y + 0.22);
        context.closePath();
        context.stroke();
        break;
      case "water":
        context.beginPath();
        context.moveTo(x - 0.32, y);
        context.quadraticCurveTo(x, y - 0.18, x + 0.34, y);
        context.stroke();
        break;
      case "cave":
        context.beginPath();
        context.moveTo(x - 0.2, y - 0.26);
        context.lineTo(x + 0.02, y);
        context.lineTo(x - 0.12, y + 0.26);
        context.stroke();
        break;
      case "road":
        context.beginPath();
        context.arc(x, y, 0.22, 0, Math.PI * 2);
        context.stroke();
        break;
      case "living":
      case "wild":
        context.beginPath();
        context.arc(x, y, 0.24, 0, Math.PI * 2);
        context.stroke();
        break;
    }
  }
  context.restore();
}

function drawSpecialPois(context: CanvasRenderingContext2D, pois: readonly WorldSpecialPoi[], activeLayerId: string): void {
  for (const poi of pois) {
    if (poi.layerId !== activeLayerId || poi.kind === "core") {
      continue;
    }
    const x = poi.x + 0.5;
    const y = poi.y + 0.5;
    context.save();
    context.fillStyle = regionAuraColor(poi.tone, 0.22);
    context.beginPath();
    context.arc(x, y, poi.priority <= 3 ? 1.35 : 1.0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = annotationStroke(poi.tone);
    context.fillStyle = annotationFill(poi.tone);
    context.lineWidth = 0.14;
    drawPoiIcon(context, poi.kind, x, y);
    context.restore();
  }
}

function drawPoiIcon(context: CanvasRenderingContext2D, kind: WorldSpecialPoi["kind"], x: number, y: number): void {
  switch (kind) {
    case "portal":
    case "gate":
      context.beginPath();
      context.arc(x, y, 0.5, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(x, y, 0.2, 0, Math.PI * 2);
      context.fill();
      break;
    case "grove":
      context.beginPath();
      context.moveTo(x, y - 0.62);
      context.lineTo(x + 0.52, y + 0.38);
      context.lineTo(x - 0.52, y + 0.38);
      context.closePath();
      context.fill();
      context.stroke();
      break;
    case "pool":
      context.beginPath();
      context.ellipse(x, y, 0.58, 0.34, -0.18, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      break;
    case "scar":
      context.beginPath();
      context.moveTo(x - 0.4, y - 0.48);
      context.lineTo(x + 0.08, y - 0.1);
      context.lineTo(x - 0.08, y + 0.5);
      context.lineTo(x + 0.42, y + 0.05);
      context.stroke();
      break;
    case "camp":
      context.beginPath();
      context.moveTo(x, y - 0.52);
      context.lineTo(x + 0.48, y + 0.44);
      context.lineTo(x - 0.48, y + 0.44);
      context.closePath();
      context.stroke();
      context.beginPath();
      context.arc(x, y + 0.2, 0.14, 0, Math.PI * 2);
      context.fill();
      break;
    case "ring":
    case "landmark":
    case "core":
      context.save();
      context.translate(x, y);
      context.rotate(Math.PI / 4);
      context.fillRect(-0.38, -0.38, 0.76, 0.76);
      context.strokeRect(-0.38, -0.38, 0.76, 0.76);
      context.restore();
      break;
  }
}

function drawStyledTerrain(context: CanvasRenderingContext2D, mapData: MapData, activeLayerId: string): void {
  context.fillStyle = activeLayerId === "cave" ? "#2f2a26" : "#dce9d1";
  context.fillRect(0, 0, mapData.width, mapData.height);

  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      const index = y * mapData.width + x;
      const terrain = mapData.terrainMap[index];
      context.fillStyle = styledTerrainColors[terrain];
      context.fillRect(x, y, 1.02, 1.02);
    }
  }

  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      const terrain = terrainAt(mapData, x, y);
      if (terrain === "forest") {
        drawForestAccent(context, x, y);
      } else if (terrain === "mountain") {
        drawMountainAccent(context, mapData, x, y);
      } else if (terrain === "water" || terrain === "deep-water") {
        drawWaterAccent(context, x, y, terrain);
      } else if (terrain === "cave-wall") {
        drawCaveWallAccent(context, x, y);
      }
    }
  }
}

function drawShorelines(context: CanvasRenderingContext2D, mapData: MapData): void {
  context.fillStyle = "rgba(231, 205, 139, 0.78)";
  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      if (!isShorelineTile(mapData, x, y)) {
        continue;
      }
      const strips = roadConnectionsToWater(mapData, x, y);
      if (strips.north) {
        context.fillRect(x, y, 1, 0.18);
      }
      if (strips.south) {
        context.fillRect(x, y + 0.82, 1, 0.18);
      }
      if (strips.west) {
        context.fillRect(x, y, 0.18, 1);
      }
      if (strips.east) {
        context.fillRect(x + 0.82, y, 0.18, 1);
      }
    }
  }
}

function drawRoads(context: CanvasRenderingContext2D, mapData: MapData, activeLayerId: string): void {
  context.lineCap = "round";
  context.lineJoin = "round";

  drawRoadLayer(context, mapData, activeLayerId, "#72573a", 0.68);
  drawRoadLayer(context, mapData, activeLayerId, "#c8a56a", 0.42);
  drawRoadLayer(context, mapData, activeLayerId, "rgba(244, 217, 157, 0.72)", 0.14);
}

function drawRoadLayer(
  context: CanvasRenderingContext2D,
  mapData: MapData,
  activeLayerId: string,
  color: string,
  lineWidth: number,
): void {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;

  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      if (!isRoadTile(mapData, x, y, activeLayerId)) {
        continue;
      }
      const connections = roadConnections(mapData, x, y);
      if (!connections.north && !connections.south && !connections.west && !connections.east) {
        context.beginPath();
        context.arc(x + 0.5, y + 0.5, lineWidth * 0.42, 0, Math.PI * 2);
        context.stroke();
        continue;
      }
      context.beginPath();
      context.moveTo(x + 0.5, y + 0.5);
      if (connections.east) {
        context.lineTo(x + 1.5, y + 0.5);
      }
      if (connections.south) {
        context.moveTo(x + 0.5, y + 0.5);
        context.lineTo(x + 0.5, y + 1.5);
      }
      context.stroke();
    }
  }
}

function drawLandmarks(context: CanvasRenderingContext2D, mapData: MapData, activeLayerId: string): void {
  for (const object of mapData.objectList) {
    if (object.layerId !== activeLayerId || object.type === "road-node") {
      continue;
    }
    drawObjectSymbol(context, object);
  }
}

function drawIdentityMarkers(context: CanvasRenderingContext2D, identity: WorldIdentity, activeLayerId: string): void {
  if (identity.core.layerId === activeLayerId) {
    drawDungeonCoreSymbol(context, identity.core);
  }
  if (identity.landmark.layerId === activeLayerId) {
    drawLandmarkSymbol(context, identity.landmark);
  }
}

function drawDungeonCoreSymbol(context: CanvasRenderingContext2D, core: WorldIdentityPoint): void {
  const x = core.x + 0.5;
  const y = core.y + 0.5;
  context.save();
  context.fillStyle = "rgba(255, 226, 91, 0.22)";
  context.beginPath();
  context.arc(x, y, 2.1, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(86, 58, 24, 0.78)";
  context.lineWidth = 0.13;
  for (let ring = 0; ring < 3; ring += 1) {
    context.beginPath();
    context.arc(x, y, 0.82 + ring * 0.42, 0, Math.PI * 2);
    context.stroke();
  }

  context.fillStyle = "rgba(255, 248, 185, 0.46)";
  context.beginPath();
  context.moveTo(x, y - 1.42);
  context.lineTo(x + 1.42, y);
  context.lineTo(x, y + 1.42);
  context.lineTo(x - 1.42, y);
  context.closePath();
  context.fill();

  context.fillStyle = "#f8d96d";
  context.strokeStyle = "#4c361c";
  context.lineWidth = 0.14;
  context.beginPath();
  context.moveTo(x, y - 0.92);
  context.lineTo(x + 0.55, y - 0.1);
  context.lineTo(x + 0.28, y + 0.86);
  context.lineTo(x - 0.28, y + 0.86);
  context.lineTo(x - 0.55, y - 0.1);
  context.closePath();
  context.fill();
  context.stroke();

  context.strokeStyle = "#fff3af";
  context.lineWidth = 0.1;
  context.beginPath();
  context.moveTo(x - 0.24, y - 0.44);
  context.lineTo(x + 0.18, y - 0.02);
  context.lineTo(x - 0.08, y + 0.52);
  context.stroke();
  context.restore();
}

function drawLandmarkSymbol(context: CanvasRenderingContext2D, landmark: WorldIdentityLandmark): void {
  const x = landmark.x + 0.5;
  const y = landmark.y + 0.5;
  const color = landmarkColor(landmark.kind);
  context.save();
  context.fillStyle = color.glow;
  context.beginPath();
  context.arc(x, y, 1.08, 0, Math.PI * 2);
  context.fill();

  context.translate(x, y);
  context.rotate(Math.PI / 4);
  context.fillStyle = color.fill;
  context.strokeStyle = color.stroke;
  context.lineWidth = 0.16;
  context.fillRect(-0.56, -0.56, 1.12, 1.12);
  context.strokeRect(-0.56, -0.56, 1.12, 1.12);
  context.restore();

  context.fillStyle = color.spark;
  context.beginPath();
  context.moveTo(x, y - 0.86);
  context.lineTo(x + 0.16, y - 0.16);
  context.lineTo(x + 0.86, y);
  context.lineTo(x + 0.16, y + 0.16);
  context.lineTo(x, y + 0.86);
  context.lineTo(x - 0.16, y + 0.16);
  context.lineTo(x - 0.86, y);
  context.lineTo(x - 0.16, y - 0.16);
  context.closePath();
  context.fill();
}

function drawPortals(context: CanvasRenderingContext2D, portals: readonly Portal[], activeLayerId: string): void {
  for (const portal of portals) {
    if (portal.fromLayerId !== activeLayerId) {
      continue;
    }
    const x = portal.x + 0.5;
    const y = portal.y + 0.5;
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = portal.toLayerId === "cave" ? "rgba(119, 68, 157, 0.9)" : "rgba(55, 144, 185, 0.9)";
    context.strokeStyle = "#f8f3da";
    context.lineWidth = 0.18;
    context.fillRect(-0.52, -0.52, 1.04, 1.04);
    context.strokeRect(-0.52, -0.52, 1.04, 1.04);
    context.restore();

    context.strokeStyle = portal.toLayerId === "cave" ? "#d8b6ff" : "#bcecff";
    context.lineWidth = 0.18;
    context.beginPath();
    context.arc(x, y, 0.86, 0, Math.PI * 2);
    context.stroke();
  }
}

function drawDebugIdentity(context: CanvasRenderingContext2D, identity: WorldIdentity, activeLayerId: string): void {
  if (identity.base.layerId === activeLayerId) {
    context.strokeStyle = "#ffdf72";
    context.lineWidth = 0.65;
    context.strokeRect(identity.base.x - 1.5, identity.base.y - 1.5, 4, 4);
  }
  if (identity.landmark.layerId === activeLayerId) {
    context.strokeStyle = "#ffffff";
    context.lineWidth = 0.55;
    context.beginPath();
    context.moveTo(identity.landmark.x - 2, identity.landmark.y + 0.5);
    context.lineTo(identity.landmark.x + 3, identity.landmark.y + 0.5);
    context.moveTo(identity.landmark.x + 0.5, identity.landmark.y - 2);
    context.lineTo(identity.landmark.x + 0.5, identity.landmark.y + 3);
    context.stroke();
  }
}

function drawObjectSymbol(context: CanvasRenderingContext2D, object: MapObject): void {
  const x = object.x + 0.5;
  const y = object.y + 0.5;
  switch (object.type) {
    case "tree":
      context.fillStyle = "#174a30";
      context.strokeStyle = "#e1edc9";
      context.lineWidth = 0.08;
      context.beginPath();
      context.moveTo(x, y - 0.58);
      context.lineTo(x + 0.48, y + 0.42);
      context.lineTo(x - 0.48, y + 0.42);
      context.closePath();
      context.fill();
      context.stroke();
      break;
    case "rock":
      context.fillStyle = "#6b6a62";
      context.strokeStyle = "#393c38";
      context.lineWidth = 0.1;
      context.beginPath();
      context.ellipse(x, y, 0.44, 0.3, -0.22, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      break;
    case "cave-entrance":
      context.fillStyle = "#3b2e46";
      context.strokeStyle = "#d7c3f7";
      context.lineWidth = 0.14;
      context.beginPath();
      context.arc(x, y + 0.14, 0.64, Math.PI, 0);
      context.lineTo(x + 0.64, y + 0.54);
      context.lineTo(x - 0.64, y + 0.54);
      context.closePath();
      context.fill();
      context.stroke();
      break;
    case "village":
      context.fillStyle = "#f2ca70";
      context.strokeStyle = "#5f4426";
      context.lineWidth = 0.12;
      context.fillRect(x - 0.44, y - 0.1, 0.88, 0.56);
      context.strokeRect(x - 0.44, y - 0.1, 0.88, 0.56);
      context.fillStyle = "#9a5032";
      context.beginPath();
      context.moveTo(x - 0.56, y - 0.1);
      context.lineTo(x, y - 0.68);
      context.lineTo(x + 0.56, y - 0.1);
      context.closePath();
      context.fill();
      context.stroke();
      break;
    default:
      context.fillStyle = "#26322d";
      context.beginPath();
      context.arc(x, y, 0.34, 0, Math.PI * 2);
      context.fill();
      break;
  }
}

function drawStyledEntityMarkers(
  context: CanvasRenderingContext2D,
  layout: StyledMapLayout,
  entities: readonly WorldEntity[],
  activeLayerId: string,
): void {
  const visibleEntities = entities.filter((entity) => entity.layerId === activeLayerId);
  const player = visibleEntities.find((entity) => entity.entityType === "player");
  const creatures = visibleEntities.filter((entity) => entity.entityType !== "player");
  const clusterSize = layout.tileSize <= 4 ? 54 : 38;
  const clusters = new Map<string, WorldEntity[]>();

  for (const entity of creatures) {
    const screen = entityScreenPoint(layout, entity);
    const key = `${Math.floor(screen.x / clusterSize)}:${Math.floor(screen.y / clusterSize)}`;
    clusters.set(key, [...(clusters.get(key) ?? []), entity]);
  }

  context.save();
  for (const entity of visibleEntities) {
    drawEntityIntentTrail(context, layout, entity);
  }
  for (const cluster of clusters.values()) {
    if (cluster.length >= 3 || (layout.tileSize <= 4 && cluster.length >= 2)) {
      drawCreatureCluster(context, layout, cluster);
      continue;
    }
    for (const entity of cluster) {
      drawCreatureMarker(context, layout, entity);
    }
  }
  if (player) {
    drawPlayerMarker(context, layout, player);
  }
  context.restore();
}

function entityScreenPoint(layout: StyledMapLayout, entity: WorldEntity): { x: number; y: number } {
  return {
    x: layout.mapX + (entity.x + 0.5) * layout.tileSize,
    y: layout.mapY + (entity.y + 0.5) * layout.tileSize,
  };
}

function drawPlayerMarker(context: CanvasRenderingContext2D, layout: StyledMapLayout, entity: WorldEntity): void {
  const { x, y } = entityScreenPoint(layout, entity);
  const hp = hpRatio(entity, 10);
  context.save();
  context.shadowColor = "rgba(38, 28, 12, 0.34)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 3;
  context.fillStyle = entity.behavior === "autoExplore" ? "rgba(255, 211, 95, 0.36)" : "rgba(255, 211, 95, 0.26)";
  context.beginPath();
  context.arc(x, y, entity.behavior === "autoExplore" ? 24 : 22, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "#fff8d0";
  context.lineWidth = 5.4;
  context.beginPath();
  context.arc(x, y, 15.2, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "#3a2a11";
  context.lineWidth = 2.6;
  context.stroke();
  context.fillStyle = "#ffd75f";
  context.strokeStyle = "#553b15";
  context.lineWidth = 2.4;
  context.beginPath();
  context.arc(x, y, 10.5, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  drawPlayerCrown(context, x, y - 14);
  context.fillStyle = "#2a1d0b";
  context.font = "900 10px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("P", x, y + 0.5);
  context.fillStyle = entity.behavior === "autoExplore" ? "#245f82" : "#553b15";
  context.beginPath();
  context.moveTo(x, y - 24);
  context.lineTo(x + 5, y - 16);
  context.lineTo(x - 5, y - 16);
  context.closePath();
  context.fill();
  drawMiniHpBar(context, x, y + 19, 28, hp);
  drawMarkerLabel(context, x, y + 34, "YOU", "#fff2a6", "#49320f");
  context.restore();
}

function drawCreatureMarker(context: CanvasRenderingContext2D, layout: StyledMapLayout, entity: WorldEntity): void {
  const { x, y } = entityScreenPoint(layout, entity);
  const radius = layout.tileSize <= 3 ? 6 : 7.2;
  const isStuck = entity.state === "stuck" || typeof entity.metadataJson.relocationReason === "string";
  const style = creatureStyle(entity);
  const combatVisual = combatVisualState(entity);
  if (combatVisual === "defeated") {
    drawDefeatedPuff(context, x, y, radius);
    return;
  }
  context.save();
  if (combatVisual === "respawning") {
    drawRespawnSparkle(context, x, y, radius);
  }
  if (combatVisual === "alert") {
    drawAlertRing(context, x, y, radius + 9);
  }
  if (combatVisual === "attacking") {
    drawAttackRing(context, x, y, radius + 11);
  }
  context.shadowColor = "rgba(44, 10, 14, 0.34)";
  context.shadowBlur = 8;
  context.shadowOffsetY = 2;
  context.fillStyle = isStuck ? "rgba(239, 155, 67, 0.34)" : combatVisual === "hit" ? "rgba(255, 230, 160, 0.48)" : "rgba(208, 50, 62, 0.28)";
  context.beginPath();
  context.arc(x, y, radius + 7, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "#fff4ed";
  context.lineWidth = 4;
  drawCreatureShape(context, x, y, radius + 1.4, style.shape);
  context.fillStyle = isStuck ? "#d9873d" : combatVisual === "hit" ? "#ffcf78" : "#d9434e";
  context.strokeStyle = "#4c1118";
  context.lineWidth = 2;
  drawCreatureShape(context, x, y, radius, style.shape);
  drawCreatureAdornment(context, x, y, radius, style.shape, "#4c1118");
  context.fillStyle = "#fff0db";
  context.beginPath();
  context.arc(x - radius * 0.32, y - radius * 0.12, 1.3, 0, Math.PI * 2);
  context.arc(x + radius * 0.32, y - radius * 0.12, 1.3, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#2b080d";
  context.beginPath();
  context.arc(x - radius * 0.32, y - radius * 0.12, 0.46, 0, Math.PI * 2);
  context.arc(x + radius * 0.32, y - radius * 0.12, 0.46, 0, Math.PI * 2);
  context.fill();
  if (isStuck) {
    context.fillStyle = "#fff3df";
    context.font = "900 8px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("!", x, y + radius + 7);
  }
  if (hasHp(entity)) {
    drawMiniHpBar(context, x, y + radius + 10, 24, hpRatio(entity, 3));
  } else if (combatVisual === "alert") {
    drawHeartIndicator(context, x, y + radius + 8, "#ffcf6e");
  }
  drawMarkerLabel(context, x, y + radius + 23, "ENEMY", "#ffe4e0", "#4c1118");
  context.restore();
}

function drawCreatureCluster(context: CanvasRenderingContext2D, layout: StyledMapLayout, entities: readonly WorldEntity[]): void {
  const averageX = entities.reduce((total, entity) => total + entity.x, 0) / entities.length;
  const averageY = entities.reduce((total, entity) => total + entity.y, 0) / entities.length;
  const x = layout.mapX + (averageX + 0.5) * layout.tileSize;
  const y = layout.mapY + (averageY + 0.5) * layout.tileSize;
  context.save();
  context.fillStyle = "rgba(166, 65, 82, 0.24)";
  context.beginPath();
  context.arc(x, y, 15, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#b9475c";
  context.strokeStyle = "#51242a";
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(x, y, 10, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#fff3df";
  context.font = "900 10px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(entities.length), x, y + 0.5);
  context.restore();
}

function drawPlayerCrown(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.save();
  context.fillStyle = "#fff0a6";
  context.strokeStyle = "#704a17";
  context.lineWidth = 1.1;
  context.beginPath();
  context.moveTo(x - 6, y + 3.6);
  context.lineTo(x - 4.2, y - 2.5);
  context.lineTo(x - 1.4, y + 1);
  context.lineTo(x, y - 4.2);
  context.lineTo(x + 1.4, y + 1);
  context.lineTo(x + 4.2, y - 2.5);
  context.lineTo(x + 6, y + 3.6);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawMiniHpBar(context: CanvasRenderingContext2D, x: number, y: number, width: number, ratio: number): void {
  const safeRatio = clampNumber(ratio, 0, 1);
  context.save();
  context.fillStyle = "rgba(46, 29, 18, 0.54)";
  fillRoundedRect(context, x - width / 2, y - 2.5, width, 5, 3);
  context.fillStyle = safeRatio > 0.55 ? "#73c66f" : safeRatio > 0.25 ? "#f0b654" : "#df5b52";
  fillRoundedRect(context, x - width / 2 + 1, y - 1.6, Math.max(2, (width - 2) * safeRatio), 3.2, 2);
  context.restore();
}

function drawHeartIndicator(context: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x, y + 3);
  context.bezierCurveTo(x - 7, y - 2, x - 3, y - 7, x, y - 3);
  context.bezierCurveTo(x + 3, y - 7, x + 7, y - 2, x, y + 3);
  context.fill();
  context.restore();
}

function drawMarkerLabel(context: CanvasRenderingContext2D, x: number, y: number, label: string, fill: string, ink: string): void {
  context.save();
  context.font = "900 9px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const width = Math.max(28, context.measureText(label).width + 12);
  context.fillStyle = "rgba(28, 21, 13, 0.34)";
  fillRoundedRect(context, x - width / 2 + 1.5, y - 7 + 1.5, width, 14, 6);
  context.fillStyle = fill;
  fillRoundedRect(context, x - width / 2, y - 7, width, 14, 6);
  context.strokeStyle = ink;
  context.lineWidth = 1.4;
  strokeRoundedRect(context, x - width / 2, y - 7, width, 14, 6);
  context.fillStyle = ink;
  context.fillText(label, x, y + 0.5);
  context.restore();
}

function drawAlertRing(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.save();
  context.strokeStyle = "rgba(255, 196, 88, 0.78)";
  context.lineWidth = 2;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.arc(x, y, radius, -Math.PI * 0.2, Math.PI * 1.65);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = "#ffcf6e";
  context.font = "900 12px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("!", x, y - radius - 5);
  context.restore();
}

function drawAttackRing(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.save();
  context.strokeStyle = "rgba(220, 70, 60, 0.72)";
  context.lineWidth = 2.3;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "rgba(255, 238, 180, 0.66)";
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(x, y, radius + 4, Math.PI * 0.2, Math.PI * 0.72);
  context.stroke();
  context.restore();
}

function drawDefeatedPuff(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.save();
  context.fillStyle = "rgba(115, 103, 90, 0.22)";
  for (let index = 0; index < 5; index += 1) {
    const angle = (Math.PI * 2 * index) / 5;
    context.beginPath();
    context.arc(x + Math.cos(angle) * radius * 0.9, y + Math.sin(angle) * radius * 0.55, radius * 0.58, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = "rgba(88, 72, 58, 0.34)";
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(x, y, radius + 5, Math.PI * 0.15, Math.PI * 1.1);
  context.stroke();
  context.restore();
}

function drawRespawnSparkle(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.save();
  context.strokeStyle = "rgba(142, 216, 255, 0.7)";
  context.fillStyle = "rgba(203, 241, 255, 0.55)";
  for (let index = 0; index < 4; index += 1) {
    const angle = (Math.PI * 2 * index) / 4 + Math.PI / 4;
    const sparkleX = x + Math.cos(angle) * (radius + 7);
    const sparkleY = y + Math.sin(angle) * (radius + 7);
    context.beginPath();
    context.moveTo(sparkleX, sparkleY - 3);
    context.lineTo(sparkleX + 1.8, sparkleY);
    context.lineTo(sparkleX, sparkleY + 3);
    context.lineTo(sparkleX - 1.8, sparkleY);
    context.closePath();
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawEntityIntentTrail(context: CanvasRenderingContext2D, layout: StyledMapLayout, entity: WorldEntity): void {
  const target = readEntityTarget(entity);
  if (!target) {
    return;
  }
  const start = entityScreenPoint(layout, entity);
  const end = {
    x: layout.mapX + (target.x + 0.5) * layout.tileSize,
    y: layout.mapY + (target.y + 0.5) * layout.tileSize,
  };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance < 12 || entity.state === "defeated" || entity.state === "respawning") {
    return;
  }
  const style = entity.entityType === "player"
    ? { stroke: "rgba(255, 199, 65, 0.42)", fill: "#ffd75f" }
    : creatureStyle(entity);
  context.save();
  context.strokeStyle = entity.entityType === "player" ? style.stroke : creatureTrailStroke(entity);
  context.lineWidth = entity.entityType === "player" ? 2 : 1.3;
  context.setLineDash(entity.entityType === "player" ? [7, 7] : [4, 7]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = entity.entityType === "player" ? "#ffd75f" : style.fill;
  context.beginPath();
  context.arc(end.x, end.y, entity.entityType === "player" ? 4.2 : 3.2, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function creatureTrailStroke(entity: WorldEntity): string {
  switch (entity.metadataJson.movementProfile) {
    case "forest":
      return "rgba(40, 105, 55, 0.28)";
    case "cave":
      return "rgba(113, 70, 155, 0.28)";
    case "water-adjacent":
      return "rgba(49, 128, 148, 0.28)";
    case "scout":
      return "rgba(154, 105, 42, 0.28)";
    default:
      return "rgba(166, 65, 82, 0.24)";
  }
}

function readEntityTarget(entity: WorldEntity): { x: number; y: number } | null {
  const target = entity.metadataJson.currentTarget ?? entity.metadataJson.wanderTarget;
  if (!target || typeof target !== "object") {
    return null;
  }
  const candidate = target as { x?: unknown; y?: unknown; layerId?: unknown };
  if (candidate.layerId && candidate.layerId !== entity.layerId) {
    return null;
  }
  if (typeof candidate.x !== "number" || typeof candidate.y !== "number") {
    return null;
  }
  return { x: Math.trunc(candidate.x), y: Math.trunc(candidate.y) };
}

function targetLabel(entity: WorldEntity): string {
  const target = entity.metadataJson.currentTarget ?? entity.metadataJson.wanderTarget;
  if (!target || typeof target !== "object") {
    return "-";
  }
  const candidate = target as { label?: unknown; kind?: unknown };
  const label = typeof candidate.label === "string" ? candidate.label : typeof candidate.kind === "string" ? candidate.kind : "target";
  return label.length > 8 ? `${label.slice(0, 7)}.` : label;
}

function creatureStyle(entity: WorldEntity): { fill: string; glow: string; stroke: string; shape: "circle" | "diamond" | "square" | "drop" } {
  switch (entity.metadataJson.movementProfile) {
    case "forest":
      return { fill: "#3f8c4f", glow: "rgba(63, 140, 79, 0.24)", stroke: "#1e4f2d", shape: "circle" };
    case "cave":
      return { fill: "#8a5bc0", glow: "rgba(138, 91, 192, 0.26)", stroke: "#4b2c68", shape: "square" };
    case "water-adjacent":
      return { fill: "#3f9aae", glow: "rgba(63, 154, 174, 0.25)", stroke: "#1f6170", shape: "drop" };
    case "scout":
      return { fill: "#c68b3e", glow: "rgba(198, 139, 62, 0.25)", stroke: "#69461e", shape: "diamond" };
    default:
      return { fill: "#b9475c", glow: "rgba(166, 65, 82, 0.24)", stroke: "#51242a", shape: "circle" };
  }
}

function combatVisualState(entity: WorldEntity): "none" | "alert" | "attacking" | "hit" | "defeated" | "respawning" {
  const state = String(entity.state);
  if (state === "defeated") {
    return "defeated";
  }
  if (state === "respawning") {
    return "respawning";
  }
  if (state === "attacking") {
    return "attacking";
  }
  if (state === "chasing" || entity.metadataJson.alert === true || entity.metadataJson.alerted === true) {
    return "alert";
  }
  if (state === "hitStun" || metadataNumber(entity.metadataJson.hitFlashUntil) > 0 || metadataNumber(entity.metadataJson.hitStunUntil) > 0) {
    return "hit";
  }
  return "none";
}

function hasHp(entity: WorldEntity): boolean {
  return metadataNumber(entity.metadataJson.hp) > 0 || metadataNumber(entity.metadataJson.maxHp) > 0;
}

function hpRatio(entity: WorldEntity, defaultMaxHp: number): number {
  const maxHp = metadataNumber(entity.metadataJson.maxHp) || defaultMaxHp;
  const hp = entity.metadataJson.hp === undefined ? maxHp : metadataNumber(entity.metadataJson.hp);
  return maxHp > 0 ? hp / maxHp : 1;
}

function drawCreatureAdornment(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  shape: "circle" | "diamond" | "square" | "drop",
  color: string,
): void {
  context.save();
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = 1;
  if (shape === "circle") {
    context.beginPath();
    context.moveTo(x - radius * 0.65, y - radius * 0.55);
    context.lineTo(x - radius * 1.15, y - radius * 1.05);
    context.lineTo(x - radius * 0.15, y - radius * 0.8);
    context.closePath();
    context.moveTo(x + radius * 0.65, y - radius * 0.55);
    context.lineTo(x + radius * 1.15, y - radius * 1.05);
    context.lineTo(x + radius * 0.15, y - radius * 0.8);
    context.closePath();
    context.fill();
  } else if (shape === "square") {
    context.beginPath();
    context.moveTo(x - radius * 0.55, y - radius * 0.75);
    context.lineTo(x - radius * 0.85, y - radius * 1.3);
    context.moveTo(x + radius * 0.55, y - radius * 0.75);
    context.lineTo(x + radius * 0.85, y - radius * 1.3);
    context.stroke();
  } else if (shape === "diamond") {
    context.beginPath();
    context.moveTo(x - radius * 0.82, y - radius * 0.12);
    context.lineTo(x - radius * 1.28, y - radius * 0.4);
    context.moveTo(x + radius * 0.82, y - radius * 0.12);
    context.lineTo(x + radius * 1.28, y - radius * 0.4);
    context.stroke();
  } else {
    context.beginPath();
    context.arc(x, y - radius * 0.72, radius * 0.22, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawCreatureShape(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  shape: "circle" | "diamond" | "square" | "drop",
): void {
  context.beginPath();
  if (shape === "diamond") {
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius, y);
    context.closePath();
  } else if (shape === "square") {
    context.rect(x - radius * 0.82, y - radius * 0.82, radius * 1.64, radius * 1.64);
  } else if (shape === "drop") {
    context.moveTo(x, y - radius);
    context.quadraticCurveTo(x + radius, y - radius * 0.1, x, y + radius);
    context.quadraticCurveTo(x - radius, y - radius * 0.1, x, y - radius);
  } else {
    context.arc(x, y, radius, 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
}

function stateAbbreviation(state: string): string {
  switch (state) {
    case "choosingTarget":
      return "C";
    case "wandering":
      return "W";
    case "traveling":
      return "T";
    case "investigating":
      return "I";
    case "returningHome":
      return "H";
    case "stuck":
      return "!";
    case "chasing":
      return "A";
    case "attacking":
      return "AT";
    case "defeated":
      return "D";
    case "respawning":
      return "R";
    case "hitStun":
      return "H";
    default:
      return state.slice(0, 1).toUpperCase();
  }
}

function drawDebugEntities(
  context: CanvasRenderingContext2D,
  entities: readonly WorldEntity[],
  activeLayerId: string,
): void {
  for (const entity of entities) {
    if (entity.layerId !== activeLayerId) {
      continue;
    }
    const isPlayer = entity.entityType === "player";
    const target = readEntityTarget(entity);
    if (target) {
      context.strokeStyle = isPlayer ? "rgba(92, 61, 12, 0.85)" : "rgba(89, 14, 23, 0.82)";
      context.lineWidth = isPlayer ? 0.45 : 0.35;
      context.setLineDash([1, 0.8]);
      context.beginPath();
      context.moveTo(entity.x + 0.5, entity.y + 0.5);
      context.lineTo(target.x + 0.5, target.y + 0.5);
      context.stroke();
      context.setLineDash([]);
    }
    context.fillStyle = isPlayer ? "#fff6cf" : "#fff4ed";
    context.beginPath();
    context.arc(entity.x + 0.5, entity.y + 0.5, isPlayer ? 3.8 : 2.9, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = isPlayer ? "#2b1d08" : "#3b0d13";
    context.lineWidth = 0.65;
    context.stroke();
    context.fillStyle = isPlayer ? "#ffd75f" : "#c44d58";
    context.beginPath();
    context.arc(entity.x + 0.5, entity.y + 0.5, isPlayer ? 2.8 : 2.15, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = isPlayer ? "#553b15" : "#fff4ed";
    context.lineWidth = 0.6;
    context.stroke();
    context.fillStyle = isPlayer ? "#2a1d0b" : "#111714";
    context.font = "bold 2.4px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(isPlayer ? "P" : "E", entity.x + 0.5, entity.y + 0.5);
    context.fillStyle = "#111714";
    context.font = "2.4px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(stateAbbreviation(entity.state), entity.x + 0.5, entity.y + 2.6);
    const hp = isPlayer ? hpRatio(entity, 10) : hpRatio(entity, 3);
    if (hasHp(entity) || isPlayer) {
      context.fillStyle = "#151d19";
      context.fillRect(entity.x - 1.25, entity.y - 2.4, 2.5, 0.42);
      context.fillStyle = hp > 0.5 ? "#61c060" : hp > 0.25 ? "#e2a84f" : "#d6554d";
      context.fillRect(entity.x - 1.18, entity.y - 2.34, Math.max(0.22, 2.36 * clampNumber(hp, 0, 1)), 0.3);
    }
    if (target) {
      context.fillStyle = "#111714";
      context.font = "2px system-ui, sans-serif";
      context.fillText(targetLabel(entity), entity.x + 0.5, entity.y + 5.2);
    }
  }
}

function drawForestAccent(context: CanvasRenderingContext2D, x: number, y: number): void {
  const hash = tileHash(x, y);
  if (hash % 3 === 0) {
    context.fillStyle = "rgba(26, 78, 45, 0.64)";
    context.beginPath();
    context.arc(x + 0.5, y + 0.5, 0.38, 0, Math.PI * 2);
    context.fill();
  }
  if (hash % 5 === 0) {
    context.fillStyle = "rgba(15, 58, 35, 0.5)";
    context.fillRect(x + 0.12, y + 0.58, 0.62, 0.18);
  }
}

function drawMountainAccent(context: CanvasRenderingContext2D, mapData: MapData, x: number, y: number): void {
  const height = mapData.heightMap[y * mapData.width + x] ?? 0.65;
  context.fillStyle = "rgba(58, 58, 54, 0.32)";
  context.beginPath();
  context.moveTo(x + 0.24, y + 0.84);
  context.lineTo(x + 0.84, y + 0.84);
  context.lineTo(x + 0.62, y + 0.18);
  context.closePath();
  context.fill();

  context.strokeStyle = height > 0.82 ? "rgba(248, 248, 232, 0.68)" : "rgba(64, 65, 60, 0.42)";
  context.lineWidth = 0.1;
  context.beginPath();
  context.moveTo(x + 0.24, y + 0.78);
  context.lineTo(x + 0.52, y + 0.22);
  context.lineTo(x + 0.82, y + 0.78);
  context.stroke();
}

function drawWaterAccent(context: CanvasRenderingContext2D, x: number, y: number, terrain: TerrainType): void {
  if (tileHash(x, y) % 7 !== 0) {
    return;
  }
  context.strokeStyle = terrain === "deep-water" ? "rgba(182, 224, 238, 0.22)" : "rgba(237, 249, 244, 0.28)";
  context.lineWidth = 0.08;
  context.beginPath();
  context.moveTo(x + 0.2, y + 0.58);
  context.quadraticCurveTo(x + 0.5, y + 0.42, x + 0.82, y + 0.58);
  context.stroke();
}

function drawCaveWallAccent(context: CanvasRenderingContext2D, x: number, y: number): void {
  if (tileHash(x, y) % 4 !== 0) {
    return;
  }
  context.fillStyle = "rgba(0, 0, 0, 0.18)";
  context.fillRect(x + 0.14, y + 0.18, 0.66, 0.18);
}

function roadConnectionsToWater(mapData: MapData, x: number, y: number): DirectionSet {
  return {
    north: isWaterTile(mapData, x, y - 1),
    south: isWaterTile(mapData, x, y + 1),
    west: isWaterTile(mapData, x - 1, y),
    east: isWaterTile(mapData, x + 1, y),
  };
}

function isWaterTile(mapData: MapData, x: number, y: number): boolean {
  const terrain = terrainAt(mapData, x, y);
  return terrain ? waterTerrains.has(terrain) : false;
}

function isRoadTile(mapData: MapData, x: number, y: number, activeLayerId?: string): boolean {
  if (!isInsideMap(mapData, x, y)) {
    return false;
  }
  const terrain = terrainAt(mapData, x, y);
  if (terrain === "road") {
    return true;
  }
  return mapData.objectList.some((object) => {
    if (object.x !== x || object.y !== y || !roadObjectTypes.has(object.type)) {
      return false;
    }
    return activeLayerId ? object.layerId === activeLayerId : true;
  });
}

function terrainAt(mapData: MapData, x: number, y: number): TerrainType | null {
  if (!isInsideMap(mapData, x, y)) {
    return null;
  }
  return mapData.terrainMap[y * mapData.width + x] ?? null;
}

function isInsideMap(mapData: Pick<MapData, "width" | "height">, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mapData.width && y < mapData.height;
}

function adjacentTiles(x: number, y: number): [number, number][] {
  return [
    [x, y - 1],
    [x, y + 1],
    [x - 1, y],
    [x + 1, y],
  ];
}

function debugObjectColor(type: string): string {
  switch (type) {
    case "tree":
      return "#163f2a";
    case "rock":
      return "#4c514f";
    case "cave-entrance":
      return "#7d4aa2";
    case "village":
      return "#d9a441";
    case "road-node":
      return "#7f6342";
    default:
      return "#26322d";
  }
}

function landmarkColor(kind: WorldIdentityLandmark["kind"]): { fill: string; glow: string; spark: string; stroke: string } {
  switch (kind) {
    case "elder-grove":
      return { fill: "#2f7c46", glow: "rgba(88, 171, 91, 0.3)", spark: "#d8f2b9", stroke: "#173d25" };
    case "cave-beacon":
      return { fill: "#7143a0", glow: "rgba(190, 126, 255, 0.34)", spark: "#f0dcff", stroke: "#3d2657" };
    case "highland-spire":
      return { fill: "#888a82", glow: "rgba(232, 226, 201, 0.32)", spark: "#fff4c7", stroke: "#424540" };
    case "tidewatch":
      return { fill: "#3b93b4", glow: "rgba(99, 190, 222, 0.32)", spark: "#d8fbff", stroke: "#1d5b78" };
    case "pathstone":
      return { fill: "#b88b4f", glow: "rgba(238, 194, 107, 0.34)", spark: "#fff0b8", stroke: "#694a2b" };
    case "heartstone":
      return { fill: "#d58a4f", glow: "rgba(255, 208, 115, 0.34)", spark: "#fff2a3", stroke: "#704129" };
  }
}

function shieldPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  context.beginPath();
  context.moveTo(x + width * 0.5, y);
  context.quadraticCurveTo(x + width * 0.9, y + height * 0.05, x + width * 0.92, y + height * 0.3);
  context.lineTo(x + width * 0.82, y + height * 0.7);
  context.quadraticCurveTo(x + width * 0.64, y + height * 0.92, x + width * 0.5, y + height);
  context.quadraticCurveTo(x + width * 0.36, y + height * 0.92, x + width * 0.18, y + height * 0.7);
  context.lineTo(x + width * 0.08, y + height * 0.3);
  context.quadraticCurveTo(x + width * 0.1, y + height * 0.05, x + width * 0.5, y);
  context.closePath();
}

function fillRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  roundedRectPath(context, x, y, width, height, radius);
  context.fill();
}

function strokeRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  roundedRectPath(context, x, y, width, height, radius);
  context.stroke();
}

function roundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const cornerRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + cornerRadius, y);
  context.lineTo(x + width - cornerRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
  context.lineTo(x + width, y + height - cornerRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
  context.lineTo(x + cornerRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
  context.lineTo(x, y + cornerRadius);
  context.quadraticCurveTo(x, y, x + cornerRadius, y);
  context.closePath();
}

function badgeFill(tone: WorldIdentityBadge["tone"]): string {
  switch (tone) {
    case "forest":
      return "#dbecc4";
    case "cave":
      return "#ead7f4";
    case "highland":
      return "#e6dfc5";
    case "water":
      return "#d8edf2";
    case "living":
      return "#f0d7d0";
    case "road":
      return "#ead7ad";
    case "wild":
      return "#e5ead1";
  }
}

function toneInk(tone: WorldIdentityBadge["tone"]): string {
  switch (tone) {
    case "forest":
      return "#24462e";
    case "cave":
      return "#56336f";
    case "highland":
      return "#514b3e";
    case "water":
      return "#20566a";
    case "living":
      return "#713d3d";
    case "road":
      return "#6d4c2c";
    case "wild":
      return "#3e4d35";
  }
}

function regionAuraColor(tone: WorldIdentityBadge["tone"], alpha: number): string {
  switch (tone) {
    case "forest":
      return `rgba(49, 105, 64, ${alpha})`;
    case "cave":
      return `rgba(95, 66, 123, ${alpha})`;
    case "highland":
      return `rgba(116, 109, 92, ${alpha})`;
    case "water":
      return `rgba(70, 143, 160, ${alpha})`;
    case "living":
      return `rgba(172, 95, 83, ${alpha})`;
    case "road":
      return `rgba(163, 116, 65, ${alpha})`;
    case "wild":
      return `rgba(176, 147, 77, ${alpha})`;
  }
}

function annotationFill(tone: string): string {
  switch (tone) {
    case "core":
      return "#ffe179";
    case "portal":
    case "cave":
      return "#d7b4ff";
    case "landmark":
      return "#ffd194";
    case "forest":
      return "#b8df8a";
    case "highland":
      return "#ddd0ac";
    case "water":
      return "#a5dce8";
    case "road":
      return "#e7bc78";
    case "activity":
      return "#d3e6b2";
    case "rare":
      return "#c6e4ec";
    case "favorite":
      return "#ffd0bb";
    case "visit":
      return "#ffe68e";
    default:
      return "#efe2bd";
  }
}

function annotationStroke(tone: string): string {
  switch (tone) {
    case "core":
      return "#7a521f";
    case "portal":
    case "cave":
      return "#71469b";
    case "landmark":
      return "#8a562a";
    case "forest":
      return "#356d3f";
    case "highland":
      return "#6c6658";
    case "water":
      return "#397c90";
    case "road":
      return "#8a5d2b";
    case "activity":
      return "#607d3a";
    case "rare":
      return "#47738a";
    case "favorite":
      return "#9b563f";
    case "visit":
      return "#a36a1b";
    default:
      return "#675137";
  }
}

function shortLabelForPoi(poi: WorldSpecialPoi): string {
  switch (poi.kind) {
    case "portal":
    case "gate":
      return "P";
    case "grove":
      return "G";
    case "pool":
      return "W";
    case "scar":
      return "S";
    case "camp":
      return "C";
    case "ring":
      return "R";
    case "core":
      return "C";
    case "landmark":
      return "L";
  }
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, cursorY);
      cursorY += lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    context.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

function rectsOverlap(left: Rect, right: Rect): boolean {
  return !(
    left.x + left.width < right.x ||
    right.x + right.width < left.x ||
    left.y + left.height < right.y ||
    right.y + right.height < left.y
  );
}

function tileHash(x: number, y: number): number {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2f);
  value ^= value >>> 16;
  return value >>> 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function metadataNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }
  return context;
}
