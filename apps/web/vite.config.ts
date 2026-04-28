import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@world-forge/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@world-forge/wasm-engine': fileURLToPath(new URL('../../engine/wasm-engine/ts/src/index.ts', import.meta.url)),
    },
  },
})
