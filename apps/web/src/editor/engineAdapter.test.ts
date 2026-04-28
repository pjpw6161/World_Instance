import { defaultRecipe } from "@world-forge/shared";
import { describe, expect, it } from "vitest";
import { createEditorEngine } from "./engineAdapter";

describe("editor engine adapter", () => {
  it("falls back to the deterministic dev module when the WASM artifact is unavailable", async () => {
    const runtimeChanges: string[] = [];
    const engine = createEditorEngine({
      wasmModuleUrl: "/wasm/missing-test-artifact.js",
      wasmBinaryUrl: "/wasm/missing-test-artifact.wasm",
      allowFallback: true,
      onRuntimeChange: (runtime) => runtimeChanges.push(runtime.kind),
    });

    const first = await engine.generate({ ...defaultRecipe, width: 64, height: 64 });
    const second = await engine.generate({ ...defaultRecipe, width: 64, height: 64 });

    expect(engine.runtime().kind).toBe("fallback");
    expect(engine.lastLoadError()).toBeTruthy();
    expect(runtimeChanges).toContain("fallback");
    expect(first.mapHash).toBe(second.mapHash);
  });

  it("fails instead of falling back when fallback is disabled", async () => {
    const engine = createEditorEngine({
      wasmModuleUrl: "/wasm/missing-test-artifact.js",
      wasmBinaryUrl: "/wasm/missing-test-artifact.wasm",
      allowFallback: false,
    });

    await expect(engine.generate({ ...defaultRecipe, width: 64, height: 64 })).rejects.toThrow(
      "WASM engine failed to load",
    );
    expect(engine.runtime().kind).toBe("wasm");
    expect(engine.runtime().label).toBe("WASM unavailable");
    expect(engine.lastLoadError()).toBeTruthy();
  });
});
