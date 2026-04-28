#pragma once

#include <cstdint>
#include <string>

namespace world_forge {

std::string engine_version();

std::string generate_map_json(
    const std::string& engine_version,
    std::uint32_t seed,
    int width,
    int height,
    bool feature_mountains,
    bool feature_forests,
    bool feature_trees,
    bool feature_roads,
    bool feature_caves,
    bool feature_rivers,
    bool feature_villages,
    const std::string& terrain_algorithm,
    const std::string& cave_algorithm,
    const std::string& road_algorithm,
    const std::string& object_placement_algorithm,
    double water_level,
    double mountain_level,
    double forest_density,
    double cave_density,
    double road_complexity);

}
