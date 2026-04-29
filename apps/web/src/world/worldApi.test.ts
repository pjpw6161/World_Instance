import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleGenerationRecipe, sampleMapStats } from "@world-forge/shared";
import {
  clearStoredAuthToken,
  createMapProject,
  forkMapProject,
  fetchMapProject,
  listMyWorldInstances,
  login,
  searchMaps,
  storeAuthToken,
  worldForgeAuthTokenStorageKey,
} from "./worldApi";

const storage = new Map<string, string>();

describe("world API client", () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not send stale bearer tokens to login", async () => {
    storeAuthToken("stale-token");
    vi.stubGlobal("fetch", vi.fn(async () => responseJson({
      user: {
        id: "user-1",
        email: "dev@example.com",
        nickname: "Dev",
        createdAt: "2026-04-28T00:00:00Z",
        updatedAt: "2026-04-28T00:00:00Z",
      },
      token: "fresh-token",
      tokenType: "Bearer",
      expiresAt: "2026-04-28T01:00:00Z",
    })));

    await login("dev@example.com", "Password123!");

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(storage.get(worldForgeAuthTokenStorageKey)).toBe("fresh-token");
  });

  it("sends bearer tokens to protected map writes", async () => {
    storeAuthToken("map-token");
    vi.stubGlobal("fetch", vi.fn(async () => responseJson({
      id: "project-1",
      ownerId: "user-1",
      title: "Saved Map",
      description: "",
      visibility: "PRIVATE",
      currentVersionId: "version-1",
      currentVersion: null,
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    })));

    await createMapProject({
      title: "Saved Map",
      description: "",
      recipe: sampleGenerationRecipe,
      stats: sampleMapStats,
      mapHash: "hash",
    });

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer map-token");
  });

  it("sends bearer tokens to public map forks", async () => {
    storeAuthToken("fork-token");
    vi.stubGlobal("fetch", vi.fn(async () => responseJson({
      id: "forked-project",
      ownerId: "user-1",
      title: "Fork of Public Map",
      description: "",
      visibility: "PRIVATE",
      currentVersionId: "forked-version",
      currentVersion: null,
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    })));

    await forkMapProject("public-project");

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/maps/public-project/fork");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer fork-token");
  });

  it("sends bearer tokens when loading map detail", async () => {
    storeAuthToken("detail-token");
    vi.stubGlobal("fetch", vi.fn(async () => responseJson({
      id: "project-1",
      ownerId: "user-1",
      title: "Private Map",
      description: "",
      visibility: "PRIVATE",
      currentVersionId: "version-1",
      currentVersion: null,
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    })));

    await fetchMapProject("project-1");

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/maps/project-1");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer detail-token");
  });

  it("retries public map detail without auth when the stored token is rejected", async () => {
    storeAuthToken("expired-token");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(responseError(401, { message: "Bearer token has expired" }))
      .mockResolvedValueOnce(responseJson({
        id: "public-project",
        ownerId: "user-2",
        title: "Public Map",
        description: "",
        visibility: "PUBLIC",
        currentVersionId: "version-2",
        currentVersion: null,
        createdAt: "2026-04-28T00:00:00Z",
        updatedAt: "2026-04-28T00:00:00Z",
      })));

    const project = await fetchMapProject("public-project");

    expect(project.title).toBe("Public Map");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);

    const firstInit = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const secondInit = vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit | undefined;
    expect(new Headers(firstInit.headers).get("Authorization")).toBe("Bearer expired-token");
    expect(new Headers(secondInit?.headers).has("Authorization")).toBe(false);
  });

  it("sends bearer tokens when loading my world instances", async () => {
    storeAuthToken("worlds-token");
    vi.stubGlobal("fetch", vi.fn(async () => responseJson([])));

    await listMyWorldInstances();

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/me/world-instances");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer worlds-token");
  });

  it("keeps public search independent from bearer token state", async () => {
    storeAuthToken("possibly-expired-token");
    vi.stubGlobal("fetch", vi.fn(async () => responseJson({
      results: [],
      total: 0,
      page: 0,
      size: 20,
    })));

    await searchMaps({
      keyword: "forest",
      features: "trees,roads",
      mapType: "forest",
      terrainAlgorithm: "noise-island",
      caveAlgorithm: "cellular-automata",
      roadAlgorithm: "astar",
      minWidth: 128,
      maxWidth: 512,
      minHeight: 128,
      maxHeight: 512,
      minForestRatio: 0.2,
      minMountainRatio: 0.1,
      minWaterRatio: 0.05,
      minLandRatio: 0.5,
      minCreatureCount: 3,
      minReachableAreaRatio: 0.7,
      minPortalCount: 1,
      sort: "mostExplorable",
      size: 20,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain("/api/search/maps?");
    expect(url).toContain("keyword=forest");
    expect(url).toContain("features=trees%2Croads");
    expect(url).toContain("terrainAlgorithm=noise-island");
    expect(url).toContain("minForestRatio=0.2");
    expect(url).toContain("minCreatureCount=3");
    expect(url).toContain("minReachableAreaRatio=0.7");
    expect(url).toContain("minPortalCount=1");
    expect(url).toContain("sort=mostExplorable");
    expect(url).not.toContain("query=");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("clears stored auth tokens", () => {
    storeAuthToken("token");
    clearStoredAuthToken();
    expect(storage.get(worldForgeAuthTokenStorageKey)).toBeUndefined();
  });
});

function responseJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function responseError(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}
