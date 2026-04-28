import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleGenerationRecipe, sampleMapStats } from "@world-forge/shared";
import {
  clearStoredAuthToken,
  createMapProject,
  forkMapProject,
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

  it("keeps public search independent from bearer token state", async () => {
    storeAuthToken("possibly-expired-token");
    vi.stubGlobal("fetch", vi.fn(async () => responseJson({
      results: [],
      total: 0,
      page: 0,
      size: 20,
    })));

    await searchMaps({ keyword: "forest" });

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit | undefined;
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
    json: async () => body,
  } as Response;
}
