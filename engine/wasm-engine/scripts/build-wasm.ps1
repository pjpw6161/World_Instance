$ErrorActionPreference = "Stop"

if (-not (Get-Command em++ -ErrorAction SilentlyContinue)) {
    Write-Error "Emscripten is not installed or em++ is not on PATH. Install and activate Emscripten before building the WASM engine."
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$DistDir = Join-Path $Root "dist"
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

em++ `
    -std=c++17 `
    -O2 `
    -I (Join-Path $Root "include") `
    (Join-Path $Root "src/engine.cpp") `
    --bind `
    -s MODULARIZE=1 `
    -s EXPORT_ES6=1 `
    -s ENVIRONMENT=web `
    -s ALLOW_MEMORY_GROWTH=1 `
    -o (Join-Path $DistDir "world_forge_engine.js")
