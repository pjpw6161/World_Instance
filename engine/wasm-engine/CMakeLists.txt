cmake_minimum_required(VERSION 3.22)

project(world_forge_wasm_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(world_forge_engine STATIC
    src/engine.cpp
)

target_include_directories(world_forge_engine
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)
