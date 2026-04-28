import type { EntityStateDto, GenerationRecipe, WorldInstanceDto } from "@world-forge/shared";
import type { SaveEntityStatePayload } from "./worldState";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

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
  mapHash: string;
  createdAt: string;
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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(body || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
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
