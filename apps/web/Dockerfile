# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build

WORKDIR /workspace

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY engine/wasm-engine/ts/package.json engine/wasm-engine/ts/package.json
RUN npm ci

COPY apps/web apps/web
COPY packages/shared packages/shared
COPY engine/wasm-engine/ts engine/wasm-engine/ts

RUN test -f apps/web/public/wasm/world_forge_engine.js \
    && test -f apps/web/public/wasm/world_forge_engine.wasm \
    || (echo "Missing WASM artifacts. Run npm run wasm:build before docker build." && exit 1)

RUN npm run shared:build \
    && npm run wasm-wrapper:build \
    && npm run web:build

RUN test -f apps/web/dist/wasm/world_forge_engine.js \
    && test -f apps/web/dist/wasm/world_forge_engine.wasm

FROM nginx:1.27-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
