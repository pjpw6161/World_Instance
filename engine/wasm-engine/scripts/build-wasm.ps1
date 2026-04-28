param(
    [string] $WebPublicDir,
    [switch] $SkipWebCopy
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command em++ -ErrorAction SilentlyContinue)) {
    Write-Error "Emscripten is not installed or em++ is not on PATH. Install and activate Emscripten before building the WASM engine."
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$DistDir = Join-Path $Root "dist"
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
$OutputJs = Join-Path $DistDir "world_forge_engine.js"
$OutputWasm = Join-Path $DistDir "world_forge_engine.wasm"
Remove-Item -Force $OutputJs, $OutputWasm -ErrorAction SilentlyContinue

if (-not $WebPublicDir) {
    $RepoRoot = Resolve-Path (Join-Path $Root "../..")
    $WebPublicDir = Join-Path $RepoRoot "apps/web/public/wasm"
}

em++ `
    -std=c++17 `
    -O2 `
    -I (Join-Path $Root "include") `
    (Join-Path $Root "src/engine.cpp") `
    --bind `
    -s MODULARIZE=1 `
    -s EXPORT_ES6=1 `
    -s EXPORT_NAME=createWorldForgeEngine `
    -s ENVIRONMENT=web `
    -s ALLOW_MEMORY_GROWTH=1 `
    -o $OutputJs

if ($LASTEXITCODE -ne 0) {
    throw "em++ failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path $OutputJs) -or -not (Test-Path $OutputWasm)) {
    throw "WASM build did not produce expected artifacts."
}

if (-not $SkipWebCopy) {
    New-Item -ItemType Directory -Force -Path $WebPublicDir | Out-Null
    Copy-Item -Force $OutputJs (Join-Path $WebPublicDir "world_forge_engine.js")
    Copy-Item -Force $OutputWasm (Join-Path $WebPublicDir "world_forge_engine.wasm")
}

Write-Host "WASM engine built:"
Write-Host "  $OutputJs"
Write-Host "  $OutputWasm"
if (-not $SkipWebCopy) {
    Write-Host "Web artifacts copied to:"
    Write-Host "  $(Join-Path $WebPublicDir "world_forge_engine.js")"
    Write-Host "  $(Join-Path $WebPublicDir "world_forge_engine.wasm")"
}
