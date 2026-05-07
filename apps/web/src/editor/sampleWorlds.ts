import { defaultRecipe, type GenerationRecipe } from "@world-forge/shared";

export interface SampleWorldPreset {
  id: string;
  title: string;
  tagline: string;
  description: string;
  recipe: GenerationRecipe;
}

export const sampleWorldPresets: readonly SampleWorldPreset[] = [
  {
    id: "forest-frontier",
    title: "고목 변경",
    tagline: "숲 밀도와 오브젝트 배치를 보기 좋은 샘플",
    description: "숲과 고목이 많은 세계입니다. 바이옴 밀도 기반 배치가 숲 지대에 어떤 차이를 만드는지 확인하기 좋습니다.",
    recipe: {
      ...defaultRecipe,
      width: 128,
      height: 128,
      seed: 242_001,
      features: {
        ...defaultRecipe.features,
        forests: true,
        trees: true,
        roads: true,
        caves: false,
        villages: true,
      },
      algorithms: {
        terrain: "noise-island",
        cave: "cellular-automata",
        road: "simple-path",
        objectPlacement: "biome-density",
      },
      params: {
        waterLevel: 0.22,
        mountainLevel: 0.38,
        forestDensity: 0.88,
        caveDensity: 0.16,
        roadComplexity: 0.46,
      },
    },
  },
  {
    id: "moon-gate-caverns",
    title: "달문 동굴권",
    tagline: "동굴 알고리즘과 포털 배치를 비교하기 좋은 샘플",
    description: "동굴 밀도가 높은 세계입니다. Cellular Automata와 Random Walk 동굴 배치 차이를 보기 좋습니다.",
    recipe: {
      ...defaultRecipe,
      width: 128,
      height: 128,
      seed: 911_204,
      features: {
        ...defaultRecipe.features,
        forests: true,
        trees: true,
        roads: true,
        caves: true,
        villages: false,
      },
      algorithms: {
        terrain: "noise-island",
        cave: "cellular-automata",
        road: "astar",
        objectPlacement: "scatter",
      },
      params: {
        waterLevel: 0.28,
        mountainLevel: 0.68,
        forestDensity: 0.36,
        caveDensity: 0.92,
        roadComplexity: 0.62,
      },
    },
  },
  {
    id: "mist-archipelago",
    title: "물안개 군도",
    tagline: "수위가 높은 저지대와 섬 형태를 확인하는 샘플",
    description: "물이 많고 산세가 낮은 세계입니다. 지형 알고리즘이 해안선과 섬 형태에 주는 차이를 보기 좋습니다.",
    recipe: {
      ...defaultRecipe,
      width: 128,
      height: 128,
      seed: 700_128,
      features: {
        ...defaultRecipe.features,
        forests: true,
        trees: true,
        roads: true,
        caves: true,
        rivers: true,
        villages: true,
      },
      algorithms: {
        terrain: "radial-island",
        cave: "random-walk",
        road: "simple-path",
        objectPlacement: "scatter",
      },
      params: {
        waterLevel: 0.84,
        mountainLevel: 0.08,
        forestDensity: 0.42,
        caveDensity: 0.34,
        roadComplexity: 0.36,
      },
    },
  },
  {
    id: "highland-roads",
    title: "고원 옛길",
    tagline: "도로 알고리즘과 산악 지형을 비교하기 좋은 샘플",
    description: "산악과 도로가 강한 세계입니다. A* 도로와 Simple Path 도로의 연결성 차이를 보기 좋습니다.",
    recipe: {
      ...defaultRecipe,
      width: 128,
      height: 128,
      seed: 501_377,
      features: {
        ...defaultRecipe.features,
        forests: true,
        trees: true,
        roads: true,
        caves: true,
        villages: true,
      },
      algorithms: {
        terrain: "radial-island",
        cave: "cellular-automata",
        road: "astar",
        objectPlacement: "biome-density",
      },
      params: {
        waterLevel: 0.18,
        mountainLevel: 0.88,
        forestDensity: 0.32,
        caveDensity: 0.52,
        roadComplexity: 0.9,
      },
    },
  },
];

export function samplePresetById(id: string): SampleWorldPreset {
  return sampleWorldPresets.find((preset) => preset.id === id) ?? sampleWorldPresets[0];
}
