import type { MapData, ObjectType, TerrainType } from "@world-forge/shared";
import type { WorldEntity } from "./worldState";

export type WorldIdentityTone = "forest" | "cave" | "highland" | "water" | "living" | "road" | "wild";
export type WorldLandmarkKind = "elder-grove" | "cave-beacon" | "highland-spire" | "tidewatch" | "pathstone" | "heartstone";
export type WorldCrestMotif = "leaf" | "cave" | "wave" | "portal" | "mountain" | "core";
export type WorldStoryStickerTone = "portal" | "rare";
export type WorldPoiKind = "core" | "landmark" | "portal" | "grove" | "pool" | "scar" | "gate" | "camp" | "ring";

export interface WorldIdentityPoint {
  x: number;
  y: number;
  layerId: string;
}

export interface WorldIdentityBadge {
  label: string;
  tone: WorldIdentityTone;
  detail: string;
}

export interface WorldCrest {
  motif: WorldCrestMotif;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  ringCount: number;
  stripeCount: number;
  seed: number;
}

export interface WorldLivingSummary {
  creatureCount: number;
  surfaceCreatureCount: number;
  caveCreatureCount: number;
  reachableAreaRatio: number;
  portalCount: number;
  blockedTileRatio: number;
}

export interface WorldIdentityLandmark extends WorldIdentityPoint {
  id: string;
  kind: WorldLandmarkKind;
  label: string;
  description: string;
}

export interface WorldRegionLabel extends WorldIdentityPoint {
  id: string;
  label: string;
  tone: WorldIdentityTone;
  radius: number;
  tileCount: number;
}

export interface WorldStorySticker extends WorldIdentityPoint {
  id: string;
  label: string;
  tone: WorldStoryStickerTone;
  detail: string;
  priority: number;
}

export interface WorldSpecialPoi extends WorldIdentityPoint {
  id: string;
  label: string;
  kind: WorldPoiKind;
  tone: WorldIdentityTone;
  description: string;
  priority: number;
}

export interface WorldIdentity {
  suggestedName: string;
  summary: string;
  crest: WorldCrest;
  core: WorldIdentityPoint;
  base: WorldIdentityPoint;
  landmark: WorldIdentityLandmark;
  badges: WorldIdentityBadge[];
  regions: WorldRegionLabel[];
  pois: WorldSpecialPoi[];
  stickers: WorldStorySticker[];
  livingStats: WorldLivingSummary;
}

interface WorldIdentityOptions {
  worldInstanceId?: string;
  worldName?: string;
}

interface RegionCandidate {
  tone: WorldIdentityTone;
  x: number;
  y: number;
  radius: number;
  tileCount: number;
  score: number;
}

const surfaceLayer = "surface";
const waterTerrains = new Set<TerrainType>(["deep-water", "water"]);

export function createWorldIdentity(
  mapData: MapData,
  entities: readonly WorldEntity[],
  options: WorldIdentityOptions = {},
): WorldIdentity {
  const livingStats = summarizeLivingWorld(mapData, entities);
  const badges = createWorldBadges(mapData, livingStats);
  const seed = `${options.worldInstanceId ?? ""}:${options.worldName ?? ""}:${mapData.mapHash}`;
  const base = findBasePoint(mapData);
  const landmark = findRepresentativeLandmark(mapData, badges, base, seed);
  const crest = createWorldCrest(mapData, livingStats, badges, seed);
  const regions = createRegionalLabels(mapData, badges, base, landmark, seed);
  const pois = createSpecialPois(mapData, livingStats, base, landmark, regions, seed);
  const stickers = createStoryStickers(mapData, livingStats, landmark, seed);
  const suggestedName = suggestWorldName(badges, landmark, seed);
  const primaryBadge = badges[0]?.label ?? "미지의 변경";
  const summary = `${primaryBadge}의 숨결이 강한 세계. 이름 붙은 지역 ${regions.length}곳, 표식 명소 ${pois.length}곳, 생명체 ${livingStats.creatureCount}마리, 문 ${livingStats.portalCount}개.`;

  return {
    suggestedName,
    summary,
    crest,
    core: base,
    base,
    landmark,
    badges,
    regions,
    pois,
    stickers,
    livingStats,
  };
}

export function summarizeLivingWorld(mapData: MapData, entities: readonly WorldEntity[]): WorldLivingSummary {
  const creatures = entities.filter((entity) => entity.entityType === "creature" || entity.entityType === "npc");
  const tileCount = Math.max(1, mapData.width * mapData.height);
  const blockedTiles = mapData.collisionMap.reduce((total, blocked) => total + (blocked ? 1 : 0), 0);

  return {
    creatureCount: creatures.length,
    surfaceCreatureCount: creatures.filter((entity) => entity.layerId === surfaceLayer).length,
    caveCreatureCount: creatures.filter((entity) => entity.layerId.toLowerCase().includes("cave")).length,
    reachableAreaRatio: normalizeRatio(mapData.stats.reachableAreaRatio ?? 1 - (mapData.stats.blockedRatio ?? blockedTiles / tileCount)),
    portalCount: mapData.portalList.length,
    blockedTileRatio: normalizeRatio(mapData.stats.blockedRatio ?? blockedTiles / tileCount),
  };
}

function createWorldBadges(mapData: MapData, livingStats: WorldLivingSummary): WorldIdentityBadge[] {
  const badges: WorldIdentityBadge[] = [];
  if ((mapData.stats.forestRatio ?? 0) >= 0.18 || (mapData.stats.treeCount ?? 0) >= 8) {
    badges.push({
      label: "짙은 수해",
      tone: "forest",
      detail: `숲이 ${percent(mapData.stats.forestRatio ?? 0)}를 덮고 있습니다`,
    });
  }
  if ((mapData.stats.caveAreaRatio ?? 0) >= 0.06 || hasObjectType(mapData, "cave-entrance")) {
    badges.push({
      label: "동굴이 많은 땅",
      tone: "cave",
      detail: `동굴권 ${percent(mapData.stats.caveAreaRatio ?? 0)}`,
    });
  }
  if (livingStats.portalCount > 0) {
    badges.push({
      label: "문에 닿은 세계",
      tone: "cave",
      detail: `표식 문 ${livingStats.portalCount}개`,
    });
  }
  if ((mapData.stats.mountainRatio ?? 0) >= 0.08 || averageHeight(mapData) >= 0.55) {
    badges.push({
      label: "높은 마루",
      tone: "highland",
      detail: `산악 지형 ${percent(mapData.stats.mountainRatio ?? 0)}`,
    });
  }
  if ((mapData.stats.waterRatio ?? 0) >= 0.34) {
    badges.push({
      label: "물안개 군도",
      tone: "water",
      detail: `수면 ${percent(mapData.stats.waterRatio ?? 0)}`,
    });
  }
  if (livingStats.creatureCount >= 2) {
    badges.push({
      label: "생명체의 보금자리",
      tone: "living",
      detail: `살아 움직이는 존재 ${livingStats.creatureCount}마리`,
    });
  }
  if ((mapData.stats.roadLength ?? 0) > 0 || hasObjectType(mapData, "road-node")) {
    badges.push({
      label: "옛길의 세계",
      tone: "road",
      detail: `길 길이 ${Math.round(mapData.stats.roadLength ?? 0)}`,
    });
  }
  if (badges.length < 3 && livingStats.reachableAreaRatio >= 0.72 && livingStats.blockedTileRatio <= 0.3) {
    badges.push({
      label: "고요한 분지",
      tone: "wild",
      detail: `${percent(livingStats.reachableAreaRatio)} 탐험 가능`,
    });
  }

  if (badges.length === 0) {
    badges.push({
      label: "미지의 변경",
      tone: "wild",
      detail: `${percent(livingStats.reachableAreaRatio)} 탐험 가능`,
    });
  }

  return badges.slice(0, 4);
}

function createWorldCrest(
  mapData: MapData,
  livingStats: WorldLivingSummary,
  badges: readonly WorldIdentityBadge[],
  seed: string,
): WorldCrest {
  const tone = livingStats.portalCount > 0 ? "cave" : badges[0]?.tone ?? "wild";
  const crestSeed = hashString(`crest:${seed}:${livingStats.portalCount}:${mapData.stats.forestRatio}:${mapData.stats.waterRatio}`);
  const palette = crestPalette(tone, crestSeed);
  const motif = chooseCrestMotif(mapData, livingStats, badges);

  return {
    motif,
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
    accentColor: palette.accent,
    ringCount: 1 + (crestSeed % 3),
    stripeCount: 2 + (Math.floor(crestSeed / 11) % 4),
    seed: crestSeed,
  };
}

function chooseCrestMotif(
  mapData: MapData,
  livingStats: WorldLivingSummary,
  badges: readonly WorldIdentityBadge[],
): WorldCrestMotif {
  if (livingStats.portalCount > 0) {
    return "portal";
  }
  const tone = badges[0]?.tone ?? "wild";
  if (tone === "forest") {
    return "leaf";
  }
  if (tone === "cave" || (mapData.stats.caveAreaRatio ?? 0) >= 0.06) {
    return "cave";
  }
  if (tone === "water") {
    return "wave";
  }
  if (tone === "highland") {
    return "mountain";
  }
  return "core";
}

function crestPalette(tone: WorldIdentityTone, seed: number): { primary: string; secondary: string; accent: string } {
  const palettes: Record<WorldIdentityTone, Array<{ primary: string; secondary: string; accent: string }>> = {
    forest: [
      { primary: "#214d35", secondary: "#7fa35b", accent: "#f0d889" },
      { primary: "#315f3a", secondary: "#a1c47a", accent: "#ffe1a0" },
    ],
    cave: [
      { primary: "#46335e", secondary: "#8e6abc", accent: "#f0cfff" },
      { primary: "#3a2f4c", secondary: "#b076d5", accent: "#ffd98e" },
    ],
    highland: [
      { primary: "#5a5c53", secondary: "#b8aa82", accent: "#fff0b0" },
      { primary: "#4e5b5b", secondary: "#94a4a0", accent: "#f8e4a4" },
    ],
    water: [
      { primary: "#1f5e7b", secondary: "#75bbcc", accent: "#f1e8b6" },
      { primary: "#226b8a", secondary: "#9bd4df", accent: "#ffe7a8" },
    ],
    living: [
      { primary: "#8b4848", secondary: "#d88778", accent: "#ffe2a1" },
      { primary: "#73425d", secondary: "#d990a7", accent: "#f8dda5" },
    ],
    road: [
      { primary: "#765334", secondary: "#c79a5d", accent: "#fff1b3" },
      { primary: "#6a5630", secondary: "#d4af68", accent: "#f7ddb0" },
    ],
    wild: [
      { primary: "#3f5849", secondary: "#a6b985", accent: "#f4d18a" },
      { primary: "#4b5240", secondary: "#c4b17a", accent: "#f0e1a2" },
    ],
  };
  const options = palettes[tone];
  return options[seed % options.length];
}

function createRegionalLabels(
  mapData: MapData,
  badges: readonly WorldIdentityBadge[],
  base: WorldIdentityPoint,
  landmark: WorldIdentityLandmark,
  seed: string,
): WorldRegionLabel[] {
  const clusteredRegions = findTerrainRegionCandidates(mapData, seed);
  const labels: WorldRegionLabel[] = [
    {
      id: "region-core-0",
      label: regionName("wild", `${seed}:core`),
      tone: badges.some((badge) => badge.tone === "living") ? "living" : "wild",
      x: base.x,
      y: base.y,
      layerId: surfaceLayer,
      radius: Math.max(4, Math.round(Math.min(mapData.width, mapData.height) * 0.08)),
      tileCount: Math.max(1, Math.round(mapData.width * mapData.height * 0.01)),
    },
  ];

  const explicitCavePoint = chooseCaveRegionPoint(mapData, landmark);
  if (explicitCavePoint) {
    labels.push({
      id: "region-cave-threshold",
      label: regionName("cave", `${seed}:cave-threshold`),
      tone: "cave",
      x: explicitCavePoint.x,
      y: explicitCavePoint.y,
      layerId: surfaceLayer,
      radius: Math.max(5, Math.round(Math.min(mapData.width, mapData.height) * 0.07)),
      tileCount: Math.max(1, Math.round(mapData.width * mapData.height * 0.012)),
    });
  }

  const desiredTones = uniqueTones([
    badges[0]?.tone ?? "wild",
    badgeToneByLabel(badges, "짙은 수해"),
    badgeToneByLabel(badges, "높은 마루"),
    badgeToneByLabel(badges, "물안개 군도"),
    landmarkTone(landmark.kind),
  ]);

  const sortedRegions = clusteredRegions
    .sort((left, right) => {
      const leftPreferred = desiredTones.includes(left.tone) ? 120 : 0;
      const rightPreferred = desiredTones.includes(right.tone) ? 120 : 0;
      return right.score + rightPreferred - (left.score + leftPreferred);
    });

  for (const region of sortedRegions) {
    if (labels.length >= 4) {
      break;
    }
    if (region.tone === "wild" || labels.some((label) => label.tone === region.tone)) {
      continue;
    }
    if (labels.some((label) => Math.abs(label.x - region.x) + Math.abs(label.y - region.y) < Math.max(6, Math.min(mapData.width, mapData.height) / 7))) {
      continue;
    }
    labels.push({
      id: `region-${region.tone}-${labels.length}`,
      label: regionName(region.tone, `${seed}:${region.tone}:${labels.length}`),
      tone: region.tone,
      x: region.x,
      y: region.y,
      layerId: surfaceLayer,
      radius: region.radius,
      tileCount: region.tileCount,
    });
  }

  if (labels.length < 3) {
    const fallbackTone = badges[0]?.tone ?? landmarkTone(landmark.kind);
    const point = chooseRegionPoint(mapData, base, landmark, fallbackTone, `${seed}:fallback-region`);
    if (!labels.some((label) => Math.abs(label.x - point.x) + Math.abs(label.y - point.y) < 4)) {
      labels.push({
        id: `region-fallback-${labels.length}`,
        label: regionName(fallbackTone, `${seed}:fallback:${labels.length}`),
        tone: fallbackTone,
        x: point.x,
        y: point.y,
        layerId: surfaceLayer,
        radius: Math.max(4, Math.round(Math.min(mapData.width, mapData.height) * 0.06)),
        tileCount: 1,
      });
    }
  }

  return labels.slice(0, 4);
}

function createStoryStickers(
  mapData: MapData,
  livingStats: WorldLivingSummary,
  landmark: WorldIdentityLandmark,
  seed: string,
): WorldStorySticker[] {
  const stickers: WorldStorySticker[] = [];

  const surfacePortal = mapData.portalList.find((portal) => portal.fromLayerId === surfaceLayer);
  if (surfacePortal) {
    stickers.push({
      id: "sticker-portal-sigil",
      label: "달문 인장",
      tone: "portal",
      detail: "지역과 층을 잇는 문턱 표식.",
      priority: 3,
      x: surfacePortal.x,
      y: surfacePortal.y,
      layerId: surfaceLayer,
    });
  }

  if (!surfacePortal || livingStats.creatureCount > 0) {
    const rareObject = mapData.objectList.find((object) => object.layerId === surfaceLayer && object.type !== "road-node");
    if (rareObject && (rareObject.x !== landmark.x || rareObject.y !== landmark.y)) {
      stickers.push({
        id: "sticker-rare-landmark",
        label: "숨은 유물",
        tone: "rare",
        detail: objectTypeLabel(rareObject.type),
        priority: 2,
        x: rareObject.x,
        y: rareObject.y,
        layerId: surfaceLayer,
      });
    }
  }

  return dedupeStickers(mapData, stickers, seed).slice(0, 2);
}

function createSpecialPois(
  mapData: MapData,
  livingStats: WorldLivingSummary,
  base: WorldIdentityPoint,
  landmark: WorldIdentityLandmark,
  regions: readonly WorldRegionLabel[],
  seed: string,
): WorldSpecialPoi[] {
  const pois: WorldSpecialPoi[] = [
    {
      id: "poi-dungeon-core",
      label: "던전 코어",
      kind: "core",
      tone: "wild",
      description: "이 세계가 당신의 것임을 알리는 중심 심장.",
      priority: 1,
      x: base.x,
      y: base.y,
      layerId: base.layerId,
    },
    {
      id: "poi-primary-landmark",
      label: landmark.label,
      kind: "landmark",
      tone: landmarkTone(landmark.kind),
      description: landmark.description,
      priority: 2,
      x: landmark.x,
      y: landmark.y,
      layerId: landmark.layerId,
    },
  ];

  const surfacePortal = mapData.portalList.find((portal) => portal.fromLayerId === surfaceLayer);
  if (surfacePortal) {
    pois.push({
      id: "poi-moon-gate",
      label: "달문",
      kind: "portal",
      tone: "cave",
      description: "지상과 깊은 층을 잇는 빛나는 문턱.",
      priority: 3,
      x: surfacePortal.x,
      y: surfacePortal.y,
      layerId: surfaceLayer,
    });
  }

  for (const region of regions) {
    if (pois.length >= 5) {
      break;
    }
    if (region.tone === "wild" || region.tone === "living" || pois.some((poi) => distanceBetween(poi, region) < Math.max(4, region.radius * 0.7))) {
      continue;
    }
    const kind = poiKindForTone(region.tone, seed, region.id);
    pois.push({
      id: `poi-${kind}-${pois.length}`,
      label: poiName(kind, region.tone, `${seed}:${region.id}`),
      kind,
      tone: region.tone,
      description: poiDescription(kind, livingStats),
      priority: 4 + pois.length,
      x: region.x,
      y: region.y,
      layerId: region.layerId,
    });
  }

  if (pois.length < 3) {
    const rareObject = mapData.objectList.find((object) => object.layerId === surfaceLayer && object.type !== "road-node");
    if (rareObject && !pois.some((poi) => poi.x === rareObject.x && poi.y === rareObject.y)) {
      pois.push({
        id: "poi-forgotten-camp",
        label: "잊힌 야영지",
        kind: "camp",
        tone: "road",
        description: objectTypeLabel(rareObject.type),
        priority: 5,
        x: rareObject.x,
        y: rareObject.y,
        layerId: surfaceLayer,
      });
    }
  }

  return pois.slice(0, 5);
}

function findBasePoint(mapData: MapData): WorldIdentityPoint {
  const center = findNearestOpenTile(mapData, Math.floor(mapData.width / 2), Math.floor(mapData.height / 2));
  return {
    ...center,
    layerId: surfaceLayer,
  };
}

function findRepresentativeLandmark(
  mapData: MapData,
  badges: readonly WorldIdentityBadge[],
  base: WorldIdentityPoint,
  seed: string,
): WorldIdentityLandmark {
  const primaryTone = badges[0]?.tone ?? "wild";
  const caveObject = mapData.objectList.find((object) => object.layerId === surfaceLayer && object.type === "cave-entrance");
  const villageObject = mapData.objectList.find((object) => object.layerId === surfaceLayer && object.type === "village");
  const surfacePortal = mapData.portalList.find((portal) => portal.fromLayerId === surfaceLayer);

  if (primaryTone === "cave" && (caveObject || surfacePortal)) {
    const source = caveObject ?? surfacePortal;
    return createLandmark("cave-beacon", "동굴 봉화", "이 세계의 동굴문 위에 밝게 선 표식.", source?.x ?? base.x, source?.y ?? base.y);
  }
  if (villageObject) {
    return createLandmark("heartstone", "화심석", "정착의 온기를 품은 당신 세계의 중심 표식.", villageObject.x, villageObject.y);
  }

  const terrainTarget = primaryToneToTerrain(primaryTone);
  const landmarkTile = chooseLandmarkTile(mapData, base, seed, terrainTarget);
  const landmark = landmarkForTone(primaryTone);
  return createLandmark(landmark.kind, landmark.label, landmark.description, landmarkTile.x, landmarkTile.y);
}

function createLandmark(
  kind: WorldLandmarkKind,
  label: string,
  description: string,
  x: number,
  y: number,
): WorldIdentityLandmark {
  return {
    id: `world-landmark-${kind}`,
    kind,
    label,
    description,
    x,
    y,
    layerId: surfaceLayer,
  };
}

function chooseLandmarkTile(
  mapData: MapData,
  base: WorldIdentityPoint,
  seed: string,
  preferredTerrain: TerrainType | null,
): { x: number; y: number } {
  let bestTile: { x: number; y: number; score: number } | null = null;
  const seedHash = hashString(seed);

  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      if (!isOpenTile(mapData, x, y)) {
        continue;
      }
      const terrain = terrainAt(mapData, x, y);
      const distance = Math.abs(x - base.x) + Math.abs(y - base.y);
      const preferredScore = preferredTerrain && terrain === preferredTerrain ? 80 : 0;
      const heightScore = (mapData.heightMap[y * mapData.width + x] ?? 0) * 18;
      const distanceScore = Math.min(distance, Math.max(mapData.width, mapData.height));
      const variationScore = (hashString(`${seedHash}:${x}:${y}`) % 19) / 10;
      const score = preferredScore + heightScore + distanceScore + variationScore;
      if (!bestTile || score > bestTile.score) {
        bestTile = { x, y, score };
      }
    }
  }

  return bestTile ?? findNearestOpenTile(mapData, base.x, base.y);
}

function findNearestOpenTile(mapData: MapData, preferredX: number, preferredY: number): { x: number; y: number } {
  const startX = clampInteger(preferredX, 0, mapData.width - 1);
  const startY = clampInteger(preferredY, 0, mapData.height - 1);
  if (isOpenTile(mapData, startX, startY)) {
    return { x: startX, y: startY };
  }
  const maxRadius = Math.max(mapData.width, mapData.height);
  for (let radius = 1; radius < maxRadius; radius += 1) {
    for (let y = startY - radius; y <= startY + radius; y += 1) {
      for (let x = startX - radius; x <= startX + radius; x += 1) {
        if ((Math.abs(x - startX) !== radius && Math.abs(y - startY) !== radius) || !isOpenTile(mapData, x, y)) {
          continue;
        }
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 };
}

function suggestWorldName(
  badges: readonly WorldIdentityBadge[],
  landmark: WorldIdentityLandmark,
  seed: string,
): string {
  const tone = badges[0]?.tone ?? "wild";
  const adjectives = adjectivePool(tone);
  const nouns = nounPool(landmark.kind);
  const hash = hashString(seed);
  return `${adjectives[hash % adjectives.length]} ${nouns[Math.floor(hash / 7) % nouns.length]}`;
}

function adjectivePool(tone: WorldIdentityTone): string[] {
  switch (tone) {
    case "forest":
      return ["이끼안", "고사리빛", "초록숨", "고목울"];
    case "cave":
      return ["은은굴", "달속", "보라문", "돌빛"];
    case "highland":
      return ["구름쉼", "높은못", "햇마루", "봉우리끝"];
    case "water":
      return ["밀물끝", "푸른안", "안개가", "암초빛"];
    case "living":
      return ["화롯숨", "밝은굴", "불씨들", "떠돌쉼"];
    case "road":
      return ["길목", "호박길", "이정표", "옛길터"];
    case "wild":
      return ["새뿌리", "별들", "첫빛", "방랑터"];
  }
}

function nounPool(kind: WorldLandmarkKind): string[] {
  switch (kind) {
    case "elder-grove":
      return ["숲", "수관", "덤불"];
    case "cave-beacon":
      return ["문", "굴", "봉화"];
    case "highland-spire":
      return ["첨탑", "왕관", "능선"];
    case "tidewatch":
      return ["망대", "항구", "섬"];
    case "pathstone":
      return ["건널목", "길", "자취"];
    case "heartstone":
      return ["화로", "핵", "보금자리"];
  }
}

function primaryToneToTerrain(tone: WorldIdentityTone): TerrainType | null {
  switch (tone) {
    case "forest":
      return "forest";
    case "highland":
      return "mountain";
    case "water":
      return "sand";
    case "road":
      return "road";
    case "cave":
    case "living":
    case "wild":
      return "grass";
  }
}

function landmarkForTone(tone: WorldIdentityTone): Pick<WorldIdentityLandmark, "kind" | "label" | "description"> {
  switch (tone) {
    case "forest":
      return {
        kind: "elder-grove",
        label: "고목 성소",
        description: "숲 세계의 수관 아래 선 오래된 표식.",
      };
    case "cave":
      return {
        kind: "cave-beacon",
        label: "동굴 봉화",
        description: "세계의 동굴문 위에 밝게 선 표식.",
      };
    case "highland":
      return {
        kind: "highland-spire",
        label: "고원 첨탑",
        description: "비탈 어디서나 보이는 높은 표식.",
      };
    case "water":
      return {
        kind: "tidewatch",
        label: "조수 망대",
        description: "섬 세계의 바다를 바라보는 표식.",
      };
    case "road":
      return {
        kind: "pathstone",
        label: "길표석",
        description: "오가는 길에 중심을 세워주는 표식.",
      };
    case "living":
    case "wild":
      return {
        kind: "heartstone",
        label: "세계심",
        description: "이 세계의 중심을 밝히는 핵심 표식.",
      };
  }
}

function uniqueTones(tones: Array<WorldIdentityTone | null | undefined>): WorldIdentityTone[] {
  const result: WorldIdentityTone[] = [];
  for (const tone of tones) {
    if (!tone || result.includes(tone)) {
      continue;
    }
    result.push(tone);
  }
  return result;
}

function findTerrainRegionCandidates(mapData: MapData, seed: string): RegionCandidate[] {
  const visited = new Uint8Array(mapData.width * mapData.height);
  const candidates: RegionCandidate[] = [];
  const minRegionSize = Math.max(3, Math.floor(mapData.width * mapData.height * 0.006));

  for (let y = 0; y < mapData.height; y += 1) {
    for (let x = 0; x < mapData.width; x += 1) {
      const startIndex = y * mapData.width + x;
      if (visited[startIndex]) {
        continue;
      }
      const tone = terrainToRegionTone(mapData.terrainMap[startIndex]);
      if (!tone) {
        visited[startIndex] = 1;
        continue;
      }
      const component = floodRegion(mapData, visited, x, y, tone);
      if (component.tileCount < minRegionSize && mapData.width * mapData.height > 32) {
        continue;
      }
      const regionSeed = hashString(`${seed}:component:${tone}:${component.x}:${component.y}:${component.tileCount}`);
      candidates.push({
        tone,
        x: component.x,
        y: component.y,
        radius: component.radius,
        tileCount: component.tileCount,
        score: component.tileCount + (regionSeed % 17) / 10,
      });
    }
  }

  return candidates;
}

function floodRegion(
  mapData: MapData,
  visited: Uint8Array,
  startX: number,
  startY: number,
  tone: WorldIdentityTone,
): { x: number; y: number; radius: number; tileCount: number } {
  const stack = [startY * mapData.width + startX];
  let tileCount = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;

  while (stack.length > 0) {
    const nextIndex = stack.pop();
    if (nextIndex === undefined) {
      continue;
    }
    const x = nextIndex % mapData.width;
    const y = Math.floor(nextIndex / mapData.width);
    if (!isInsideMap(mapData, x, y)) {
      continue;
    }
    const index = y * mapData.width + x;
    if (visited[index] || terrainToRegionTone(mapData.terrainMap[index]) !== tone) {
      continue;
    }
    visited[index] = 1;
    tileCount += 1;
    sumX += x;
    sumY += y;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    if (x + 1 < mapData.width) {
      stack.push(index + 1);
    }
    if (x > 0) {
      stack.push(index - 1);
    }
    if (y + 1 < mapData.height) {
      stack.push(index + mapData.width);
    }
    if (y > 0) {
      stack.push(index - mapData.width);
    }
  }

  return {
    x: clampInteger(Math.round(sumX / Math.max(1, tileCount)), 0, mapData.width - 1),
    y: clampInteger(Math.round(sumY / Math.max(1, tileCount)), 0, mapData.height - 1),
    radius: Math.max(4, Math.ceil(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.54)),
    tileCount,
  };
}

function terrainToRegionTone(terrain: TerrainType | undefined): WorldIdentityTone | null {
  switch (terrain) {
    case "forest":
      return "forest";
    case "mountain":
      return "highland";
    case "deep-water":
    case "water":
    case "sand":
      return "water";
    case "road":
      return "road";
    case "cave-floor":
    case "cave-wall":
      return "cave";
    case "grass":
    default:
      return null;
  }
}

function chooseCaveRegionPoint(mapData: MapData, landmark: WorldIdentityLandmark): { x: number; y: number } | null {
  const caveObject = mapData.objectList.find((object) => object.layerId === surfaceLayer && object.type === "cave-entrance");
  const portal = mapData.portalList.find((candidate) => candidate.fromLayerId === surfaceLayer);
  if (caveObject) {
    return { x: caveObject.x, y: caveObject.y };
  }
  if (portal) {
    return { x: portal.x, y: portal.y };
  }
  if (landmark.kind === "cave-beacon") {
    return { x: landmark.x, y: landmark.y };
  }
  return null;
}

function badgeToneByLabel(badges: readonly WorldIdentityBadge[], label: string): WorldIdentityTone | null {
  return badges.find((badge) => badge.label === label)?.tone ?? null;
}

function landmarkTone(kind: WorldLandmarkKind): WorldIdentityTone {
  switch (kind) {
    case "elder-grove":
      return "forest";
    case "cave-beacon":
      return "cave";
    case "highland-spire":
      return "highland";
    case "tidewatch":
      return "water";
    case "pathstone":
      return "road";
    case "heartstone":
      return "wild";
  }
}

function chooseRegionPoint(
  mapData: MapData,
  base: WorldIdentityPoint,
  landmark: WorldIdentityLandmark,
  tone: WorldIdentityTone,
  seed: string,
): { x: number; y: number } {
  if (tone === "cave") {
    const caveObject = mapData.objectList.find((object) => object.layerId === surfaceLayer && object.type === "cave-entrance");
    const portal = mapData.portalList.find((candidate) => candidate.fromLayerId === surfaceLayer);
    if (caveObject) {
      return { x: caveObject.x, y: caveObject.y };
    }
    if (portal) {
      return { x: portal.x, y: portal.y };
    }
  }
  if (tone === landmarkTone(landmark.kind)) {
    return { x: landmark.x, y: landmark.y };
  }
  return chooseLandmarkTile(mapData, base, seed, primaryToneToTerrain(tone));
}

function regionName(tone: WorldIdentityTone, seed: string): string {
  const prefixes: Record<WorldIdentityTone, string[]> = {
    forest: ["속삭임", "가시뿌리", "이끼장막", "고목가지"],
    cave: ["빈울림", "불씨", "그늘", "재빛"],
    highland: ["재빛", "구름쉼", "철봉우리", "회색첨탑"],
    water: ["가라앉은", "안개늪", "갈대유리", "고요물"],
    living: ["가시뿌리", "떠돌빛", "화롯숨", "불씨"],
    road: ["길돌", "호박길", "등불", "옛 이정"],
    wild: ["성소", "첫빛", "새뿌리", "별들"],
  };
  const suffixes: Record<WorldIdentityTone, string[]> = {
    forest: ["숲", "둥지", "골", "수관"],
    cave: ["문", "소굴", "동굴", "분지"],
    highland: ["능선", "왕관", "흉터", "망대"],
    water: ["분지", "물가", "못", "늪"],
    living: ["둥지", "초지", "들", "마당"],
    road: ["건널목", "자취", "둑길", "옛길"],
    wild: ["고리", "터", "골", "자락"],
  };
  const hash = hashString(`region-name:${seed}:${tone}`);
  const prefix = prefixes[tone][hash % prefixes[tone].length];
  const suffix = suffixes[tone][Math.floor(hash / 13) % suffixes[tone].length];
  return `${prefix} ${suffix}`;
}

function poiKindForTone(tone: WorldIdentityTone, seed: string, id: string): WorldPoiKind {
  const hash = hashString(`${seed}:poi-kind:${tone}:${id}`);
  switch (tone) {
    case "forest":
      return hash % 2 === 0 ? "grove" : "ring";
    case "water":
      return "pool";
    case "highland":
      return hash % 2 === 0 ? "scar" : "ring";
    case "cave":
      return "gate";
    case "road":
      return "camp";
    case "living":
    case "wild":
      return "ring";
  }
}

function poiName(kind: WorldPoiKind, tone: WorldIdentityTone, seed: string): string {
  const names: Record<WorldPoiKind, string[]> = {
    core: ["던전 코어"],
    landmark: ["세계 표식"],
    portal: ["달문"],
    grove: ["속삭임 숲", "가시뿌리 둥지", "이끼묶인 숲", "뿌리망대 숲"],
    pool: ["가라앉은 못", "희미샘", "고요못", "갈대유리 못"],
    scar: ["불씨 흉터", "재빛 능선", "철흉터", "잿불 틈"],
    gate: ["수정 골", "달문", "빈울림 문", "희미문"],
    camp: ["파수꾼의 쉼터", "잊힌 야영지", "등불 쉼터", "옛길 야영지"],
    ring: tone === "highland" ? ["무너진 고리", "돌왕관", "성소 고리"] : ["무너진 고리", "성소 고리", "뿌리 고리"],
  };
  const options = names[kind];
  return options[hashString(`poi-name:${seed}:${kind}:${tone}`) % options.length];
}

function poiDescription(kind: WorldPoiKind, livingStats: WorldLivingSummary): string {
  switch (kind) {
    case "core":
      return "이 세계가 당신의 것임을 알리는 중심 심장.";
    case "landmark":
      return "아틀라스에 가장 먼저 적힌 대표 표식.";
    case "portal":
      return "층과 층 사이를 잇는 문턱.";
    case "grove":
      return "숲 지역에 오래 기억될 나무 그늘.";
    case "pool":
      return "지도에 고요히 남은 물의 표식.";
    case "scar":
      return "험한 고지대에 새겨진 거친 흔적.";
    case "gate":
      return "더 깊은 길을 향해 선 동굴 표식.";
    case "camp":
      return "길가에 남은 작은 쉼터의 흔적.";
    case "ring":
      return livingStats.creatureCount > 0 ? "살아 있는 길목 곁에 그려진 고리." : "다음 방문을 위해 남겨둔 오래된 고리.";
  }
}

function objectTypeLabel(type: ObjectType): string {
  switch (type) {
    case "tree":
      return "고목";
    case "rock":
      return "표식 바위";
    case "cave-entrance":
      return "동굴 아귀";
    case "village":
      return "화롯가 마을";
    case "road-node":
      return "옛 길표석";
  }
}

function dedupeStickers(mapData: MapData, stickers: readonly WorldStorySticker[], seed: string): WorldStorySticker[] {
  const seen = new Set<string>();
  const shifted: WorldStorySticker[] = [];
  const sortedStickers = [...stickers].sort((left, right) => left.priority - right.priority);
  for (const sticker of sortedStickers) {
    const key = `${sticker.label}:${sticker.layerId}:${sticker.x}:${sticker.y}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const offset = (hashString(`${seed}:${sticker.id}`) % 3) - 1;
    shifted.push({
      ...sticker,
      x: clampInteger(sticker.x + offset, 0, mapData.width - 1),
      y: clampInteger(sticker.y - offset, 0, mapData.height - 1),
    });
  }
  return shifted;
}

function distanceBetween(left: WorldIdentityPoint, right: WorldIdentityPoint): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function hasObjectType(mapData: MapData, objectType: string): boolean {
  return mapData.objectList.some((object) => object.type === objectType);
}

function averageHeight(mapData: MapData): number {
  if (mapData.heightMap.length === 0) {
    return 0;
  }
  return mapData.heightMap.reduce((total, height) => total + clamp01(height), 0) / mapData.heightMap.length;
}

function isOpenTile(mapData: MapData, x: number, y: number): boolean {
  if (!isInsideMap(mapData, x, y)) {
    return false;
  }
  const index = y * mapData.width + x;
  if (mapData.collisionMap[index] === true || waterTerrains.has(mapData.terrainMap[index])) {
    return false;
  }
  return !mapData.objectList.some((object) => object.layerId === surfaceLayer && object.x === x && object.y === y && (object.type === "tree" || object.type === "rock"));
}

function terrainAt(mapData: MapData, x: number, y: number): TerrainType {
  return mapData.terrainMap[y * mapData.width + x] ?? "grass";
}

function isInsideMap(mapData: Pick<MapData, "width" | "height">, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mapData.width && y < mapData.height;
}

function percent(value: number): string {
  return `${Math.round(normalizeRatio(value) * 100)}%`;
}

function normalizeRatio(value: number): number {
  return clamp01(Number.isFinite(value) ? value : 0);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
