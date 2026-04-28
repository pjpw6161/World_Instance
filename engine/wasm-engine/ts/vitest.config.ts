import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@world-forge/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
});
