$ErrorActionPreference = "Stop"

if (-not (Get-Command emcc -ErrorAction SilentlyContinue)) {
    Write-Error "Emscripten is not installed or emcc is not on PATH. Install/activate Emscripten before building the WASM engine."
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $Root "build"

cmake -S $Root -B $BuildDir -DCMAKE_TOOLCHAIN_FILE="$env:EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"
cmake --build $BuildDir
