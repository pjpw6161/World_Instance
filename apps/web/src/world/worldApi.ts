import type { EntityStateDto, GenerationRecipe, MapStats, WorldInstanceDto } from "@world-forge/shared";
import type { SaveEntityStatePayload } from "./worldState";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
export const worldForgeAuthTokenStorageKey = "worldForge.authToken";

export type MapVisibility = "PRIVATE" | "PUBLIC";

export interface AuthUserPayload {
  id: string;
  email: string;
  nickname: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponsePayload {
  user: AuthUserPayload;
  token: string;
  tokenType: "Bearer";
  expiresAt: string;
}

export interface WorldStatePayload {
  worldInstance: WorldInstanceDto & {
    createdAt: string;
  };
  entities: EntityStateDto[];
}

export interface MapVersionPayload {
  id: string;
  projectId: string;
  engineVersion: string;
  seed: number;
  width: number;
  height: number;
  recipe: GenerationRecipe;
  stats: MapStats & Record<string, unknown>;
  mapHash: string;
  thumbnailUrl?: string | null;
  createdAt: string;
}

export interface MapProjectPayload {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  visibility: MapVisibility;
  currentVersionId: string | null;
  currentVersion: MapVersionPayload | null;
  createdAt: string;
  updatedAt: string;
}

export interface MapSearchResultPayload {
  projectId: string;
  versionId: string;
  title: string;
  description: string;
  mapType: string;
  mapHash: string;
  engineVersion: string;
  width: number;
  height: number;
  features: string[];
  terrainAlgorithm: string;
  caveAlgorithm: string;
  roadAlgorithm: string;
  objectPlacementAlgorithm: string;
  livingActivity: string;
  stats: Record<string, number>;
  livingStats: Record<string, number>;
  similarityScore?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MapSearchPayload {
  results: MapSearchResultPayload[];
  total: number;
  page: number;
  size: number;
}

export interface FacetBucketPayload {
  value: string;
  count: number;
}

export interface MapSearchFacetsPayload {
  mapTypes: FacetBucketPayload[];
  features: FacetBucketPayload[];
  terrainAlgorithms: FacetBucketPayload[];
  caveAlgorithms: FacetBucketPayload[];
  roadAlgorithms: FacetBucketPayload[];
  objectPlacementAlgorithms: FacetBucketPayload[];
  livingActivities: FacetBucketPayload[];
  creatureCounts: FacetBucketPayload[];
  surfaceCreatureCounts: FacetBucketPayload[];
  caveCreatureCounts: FacetBucketPayload[];
  reachableAreaRatios: FacetBucketPayload[];
  portalCounts: FacetBucketPayload[];
}

export interface CreateMapProjectInput {
  title: string;
  description: string;
  recipe: GenerationRecipe;
  stats: MapStats;
  mapHash: string;
}

export interface CreateWorldInstanceInput {
  mapVersionId: string;
  name: string;
  worldTime?: number;
  entities?: readonly SaveEntityStatePayload[];
}

export interface SearchMapsInput {
  keyword?: string;
  features?: string;
  mapType?: string;
  livingActivity?: string;
  minCreatureCount?: number;
  minReachableAreaRatio?: number;
  size?: number;
}

export async function signUp(email: string, password: string, nickname: string): Promise<AuthResponsePayload> {
  const auth = await fetchJson<AuthResponsePayload>("/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, nickname }),
  }, { auth: false });
  storeAuthToken(auth.token);
  return auth;
}

export async function login(email: string, password: string): Promise<AuthResponsePayload> {
  const auth = await fetchJson<AuthResponsePayload>("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  }, { auth: false });
  storeAuthToken(auth.token);
  return auth;
}

export async function fetchCurrentUser(): Promise<AuthUserPayload> {
  return fetchJson<AuthUserPayload>("/api/me");
}

export async function createMapProject(input: CreateMapProjectInput): Promise<MapProjectPayload> {
  return fetchJson<MapProjectPayload>("/api/maps", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function listMyMaps(): Promise<MapProjectPayload[]> {
  return fetchJson<MapProjectPayload[]>("/api/me/maps");
}

export async function updateMapProjectVisibility(projectId: string, visibility: MapVisibility): Promise<MapProjectPayload> {
  return fetchJson<MapProjectPayload>(`/api/maps/${projectId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ visibility }),
  });
}

export async function forkMapProject(projectId: string): Promise<MapProjectPayload> {
  return fetchJson<MapProjectPayload>(`/api/maps/${projectId}/fork`, {
    method: "POST",
  });
}

export async function createWorldInstance(input: CreateWorldInstanceInput): Promise<WorldStatePayload> {
  return fetchJson<WorldStatePayload>("/api/world-instances", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mapVersionId: input.mapVersionId,
      name: input.name,
      worldTime: input.worldTime ?? 0,
      entities: input.entities ?? [],
    }),
  });
}

export async function searchMaps(input: SearchMapsInput): Promise<MapSearchPayload> {
  const params = new URLSearchParams();
  appendParam(params, "keyword", input.keyword);
  appendParam(params, "features", input.features);
  appendParam(params, "mapType", input.mapType);
  appendParam(params, "livingActivity", input.livingActivity);
  appendParam(params, "minCreatureCount", input.minCreatureCount);
  appendParam(params, "minReachableAreaRatio", input.minReachableAreaRatio);
  appendParam(params, "size", input.size);
  const suffix = params.toString();
  return fetchJson<MapSearchPayload>(`/api/search/maps${suffix ? `?${suffix}` : ""}`, undefined, { auth: false });
}

export async function fetchSearchFacets(): Promise<MapSearchFacetsPayload> {
  return fetchJson<MapSearchFacetsPayload>("/api/search/maps/facets", undefined, { auth: false });
}

export async function fetchWorldState(worldInstanceId: string): Promise<WorldStatePayload> {
  return fetchJson<WorldStatePayload>(`/api/world-instances/${worldInstanceId}/state`);
}

export async function fetchMapVersion(mapVersionId: string): Promise<MapVersionPayload> {
  return fetchJson<MapVersionPayload>(`/api/map-versions/${mapVersionId}`);
}

export async function saveWorldState(
  worldInstanceId: string,
  worldTime: number,
  entities: readonly SaveEntityStatePayload[],
): Promise<WorldStatePayload> {
  return fetchJson<WorldStatePayload>(`/api/world-instances/${worldInstanceId}/state`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      worldTime,
      entities,
    }),
  });
}

async function fetchJson<T>(path: string, init?: RequestInit, options: { auth?: boolean } = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, options.auth === false ? init : withAuthHeader(init));
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(body || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function withAuthHeader(init?: RequestInit): RequestInit {
  const token = getStoredAuthToken();
  if (!token) {
    return init ?? {};
  }
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return {
    ...init,
    headers,
  };
}

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const token = window.localStorage.getItem(worldForgeAuthTokenStorageKey);
    return token && token.trim().length > 0 ? token.trim() : null;
  } catch {
    return null;
  }
}

export function storeAuthToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(worldForgeAuthTokenStorageKey, token);
}

export function clearStoredAuthToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(worldForgeAuthTokenStorageKey);
}

function appendParam(params: URLSearchParams, key: string, value: string | number | null | undefined): void {
  if (value === null || value === undefined || value === "") {
    return;
  }
  params.set(key, String(value));
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; details?: string[] };
    if (body.details && body.details.length > 0) {
      return `${body.message ?? "Request failed"}: ${body.details[0]}`;
    }
    return body.message ?? "";
  } catch {
    return "";
  }
}
