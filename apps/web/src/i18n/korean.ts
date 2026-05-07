export const appName = "월드 포지";

const featureLabels: Record<string, string> = {
  trees: "고목 숲",
  roads: "옛길",
  caves: "동굴문",
  rivers: "물길",
  villages: "정착지",
  forests: "숲 지대",
  mountains: "고원",
};

const algorithmLabels: Record<string, string> = {
  "noise-island": "노이즈 섬 생성 (Noise Island)",
  "radial-island": "방사형 섬 생성 (Radial Island)",
  "cellular-automata": "셀룰러 오토마타 동굴 (Cellular Automata)",
  "random-walk": "랜덤 워크 동굴 (Random Walk)",
  astar: "A* 길찾기 도로 (A*)",
  "simple-path": "단순 경로 도로 (Simple Path)",
  "biome-density": "바이옴 밀도 기반 배치 (Biome Density)",
  scatter: "산포 배치 (Scatter)",
};

const mapTypeLabels: Record<string, string> = {
  mixed: "혼합 지대",
  forest: "깊은 숲",
  mountain: "고산 지대",
  archipelago: "물안개 군도",
  cave: "동굴권",
};

const visibilityLabels: Record<string, string> = {
  PUBLIC: "공개",
  PRIVATE: "비공개",
  public: "공개",
  private: "비공개",
};

const statusLabels: Record<string, string> = {
  idle: "대기",
  loading: "불러오는 중",
  ready: "준비됨",
  saving: "저장 중",
  error: "오류",
  invalid: "설정 확인 필요",
  generating: "세계 빚는 중",
  submitting: "확인 중",
  working: "처리 중",
  forking: "복제 중",
};

const metricLabels: Record<string, string> = {
  waterRatio: "수면 비율",
  landRatio: "육지 비율",
  forestRatio: "숲 비율",
  mountainRatio: "산악 비율",
  caveAreaRatio: "동굴 비율",
  treeCount: "고목 수",
  roadLength: "길 길이",
  villageCount: "정착지 수",
  blockedRatio: "막힌 지형",
  reachableAreaRatio: "탐험 가능",
  generationTimeMs: "생성 시간",
  creatureCount: "생명체",
  surfaceCreatureCount: "지상 생명체",
  caveCreatureCount: "동굴 생명체",
  portalCount: "문",
  blockedTileRatio: "막힌 칸",
  npcCount: "주민",
  livingDensity: "생활 밀도",
  creatureDensity: "생명 밀도",
  waterLevel: "수위",
  mountainLevel: "산세",
  forestDensity: "숲 밀도",
  caveDensity: "동굴 밀도",
  roadComplexity: "길 복잡도",
  terrain: "지형 알고리즘",
  cave: "동굴 알고리즘",
  road: "도로 알고리즘",
  objectPlacement: "오브젝트 배치 알고리즘",
};

const entityStateLabels: Record<string, string> = {
  idle: "머무는 중",
  choosingTarget: "목적지 고르는 중",
  wandering: "배회 중",
  traveling: "이동 중",
  investigating: "살피는 중",
  returningHome: "둥지로 돌아가는 중",
  stuck: "길이 막힘",
  chasing: "추격 중",
  attacking: "공격 중",
  hitStun: "휘청임",
  defeated: "쓰러짐",
  respawning: "다시 나타나는 중",
};

const objectLabels: Record<string, string> = {
  tree: "고목",
  rock: "표식 바위",
  "cave-entrance": "동굴문",
  village: "화롯가 마을",
  "road-node": "길표석",
};

export function featureLabel(value: string): string {
  return featureLabels[value] ?? titleize(value);
}

export function algorithmLabel(value: string): string {
  return algorithmLabels[value] ?? value;
}

export function mapTypeLabel(value: string): string {
  return mapTypeLabels[value] ?? titleize(value);
}

export function visibilityLabel(value: string): string {
  return visibilityLabels[value] ?? value;
}

export function statusLabel(value: string): string {
  return statusLabels[value] ?? value;
}

export function metricLabel(value: string): string {
  return metricLabels[value] ?? titleize(value);
}

export function entityStateLabel(value: string): string {
  return entityStateLabels[value] ?? value;
}

export function objectLabel(value: string): string {
  return objectLabels[value] ?? titleize(value);
}

export function ownerLabel(isCurrentUser: boolean, nicknameOrId: string): string {
  return isCurrentUser ? `${nicknameOrId} 님의 세계` : `기록자 ${nicknameOrId}`;
}

export function formatKoreanDate(value: string, withTime = true): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" as const } : {}),
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function titleize(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
