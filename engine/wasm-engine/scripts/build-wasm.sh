#!/usr/bin/env bash
set -euo pipefail

web_public_dir=""
skip_web_copy=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web-public-dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --web-public-dir." >&2
        exit 2
      fi
      web_public_dir="$2"
      shift 2
      ;;
    --skip-web-copy)
      skip_web_copy=1
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  engine/wasm-engine/scripts/build-wasm.sh [--web-public-dir <dir>] [--skip-web-copy]

Builds the C++17 Emscripten engine and copies the browser artifacts to apps/web/public/wasm by default.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if ! command -v em++ >/dev/null 2>&1; then
  echo "Emscripten is not installed or em++ is not on PATH. Install and activate Emscripten before building the WASM engine." >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$root/../.." && pwd)"
dist_dir="$root/dist"
output_js="$dist_dir/world_forge_engine.js"
output_wasm="$dist_dir/world_forge_engine.wasm"

mkdir -p "$dist_dir"
rm -f "$output_js" "$output_wasm"

if [[ -z "$web_public_dir" ]]; then
  web_public_dir="$repo_root/apps/web/public/wasm"
fi

em++ \
  -std=c++17 \
  -O2 \
  -I "$root/include" \
  "$root/src/engine.cpp" \
  --bind \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createWorldForgeEngine \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -o "$output_js"

if [[ ! -f "$output_js" || ! -f "$output_wasm" ]]; then
  echo "WASM build did not produce expected artifacts." >&2
  exit 1
fi

if [[ "$skip_web_copy" -eq 0 ]]; then
  mkdir -p "$web_public_dir"
  cp -f "$output_js" "$web_public_dir/world_forge_engine.js"
  cp -f "$output_wasm" "$web_public_dir/world_forge_engine.wasm"
fi

echo "WASM engine built:"
echo "  $output_js"
echo "  $output_wasm"
if [[ "$skip_web_copy" -eq 0 ]]; then
  echo "Web artifacts copied to:"
  echo "  $web_public_dir/world_forge_engine.js"
  echo "  $web_public_dir/world_forge_engine.wasm"
fi
