#include "world_forge/engine.hpp"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#endif

namespace world_forge {
namespace {

constexpr std::uint64_t FNV_OFFSET = 14695981039346656037ull;
constexpr std::uint64_t FNV_PRIME = 1099511628211ull;

struct Features {
    bool mountains;
    bool forests;
    bool trees;
    bool roads;
    bool caves;
    bool rivers;
    bool villages;
};

struct Params {
    double water_level;
    double mountain_level;
    double forest_density;
    double cave_density;
    double road_complexity;
};

struct TileData {
    double height;
    std::string terrain;
    bool blocked;
    int cost;
};

struct Stats {
    int water_count = 0;
    int land_count = 0;
    int forest_count = 0;
    int mountain_count = 0;
    int blocked_count = 0;
};

std::uint64_t splitmix64(std::uint64_t value) {
    value += 0x9e3779b97f4a7c15ull;
    value = (value ^ (value >> 30u)) * 0xbf58476d1ce4e5b9ull;
    value = (value ^ (value >> 27u)) * 0x94d049bb133111ebull;
    return value ^ (value >> 31u);
}

std::uint64_t fnv1a_append(std::uint64_t hash, const std::string& value) {
    for (const unsigned char character : value) {
        hash ^= character;
        hash *= FNV_PRIME;
    }
    return hash;
}

std::uint64_t fnv1a(const std::string& value) {
    return fnv1a_append(FNV_OFFSET, value);
}

double clamp01(double value) {
    return std::max(0.0, std::min(1.0, value));
}

double unit_noise(std::uint64_t seed_key, int x, int y, std::uint64_t salt) {
    const auto mixed = splitmix64(seed_key
        ^ (static_cast<std::uint64_t>(x) * 0x9e3779b185ebca87ull)
        ^ (static_cast<std::uint64_t>(y) * 0xc2b2ae3d27d4eb4full)
        ^ salt);
    return static_cast<double>(mixed >> 11u) * (1.0 / 9007199254740992.0);
}

double round4(double value) {
    return std::round(value * 10000.0) / 10000.0;
}

double island_falloff(int x, int y, int width, int height) {
    const double nx = (static_cast<double>(x) + 0.5) / static_cast<double>(width) * 2.0 - 1.0;
    const double ny = (static_cast<double>(y) + 0.5) / static_cast<double>(height) * 2.0 - 1.0;
    const double distance = std::sqrt(nx * nx + ny * ny);
    return clamp01(1.0 - distance * 0.82);
}

double tile_height(
    const std::string& terrain_algorithm,
    std::uint64_t seed_key,
    int x,
    int y,
    int width,
    int height) {
    const double falloff = island_falloff(x, y, width, height);
    const double coarse = unit_noise(seed_key, x / 4, y / 4, 0x5f3759dfull);
    const double fine = unit_noise(seed_key, x, y, 0x85ebca6bull);

    if (terrain_algorithm == "radial-island") {
        return round4(clamp01(falloff * 0.88 + fine * 0.12));
    }

    return round4(clamp01(falloff * 0.56 + coarse * 0.30 + fine * 0.14));
}

std::string classify_terrain(
    double height,
    double forest_noise,
    const Features& features,
    const Params& params) {
    if (height < params.water_level - 0.08) {
        return "deep-water";
    }
    if (height < params.water_level) {
        return "water";
    }
    if (height < params.water_level + 0.04) {
        return "sand";
    }
    if (features.mountains && height >= params.mountain_level) {
        return "mountain";
    }
    if (features.forests && height > params.water_level + 0.08 && forest_noise < params.forest_density) {
        return "forest";
    }
    return "grass";
}

bool is_blocked(const std::string& terrain) {
    return terrain == "deep-water" || terrain == "water" || terrain == "cave-wall";
}

int movement_cost(const std::string& terrain) {
    if (terrain == "deep-water" || terrain == "water" || terrain == "cave-wall") {
        return 255;
    }
    if (terrain == "road") {
        return 1;
    }
    if (terrain == "forest") {
        return 4;
    }
    if (terrain == "mountain") {
        return 8;
    }
    return 2;
}

std::string json_escape(const std::string& value) {
    std::ostringstream out;
    for (const char character : value) {
        switch (character) {
            case '"':
                out << "\\\"";
                break;
            case '\\':
                out << "\\\\";
                break;
            case '\n':
                out << "\\n";
                break;
            case '\r':
                out << "\\r";
                break;
            case '\t':
                out << "\\t";
                break;
            default:
                out << character;
                break;
        }
    }
    return out.str();
}

std::string hash_hex(std::uint64_t hash) {
    std::ostringstream out;
    out << std::hex << std::setfill('0') << std::setw(16) << hash;
    return out.str();
}

std::string bool_json(bool value) {
    return value ? "true" : "false";
}

std::string build_recipe_key(
    const std::string& recipe_engine_version,
    std::uint32_t seed,
    int width,
    int height,
    const Features& features,
    const std::string& terrain_algorithm,
    const std::string& cave_algorithm,
    const std::string& road_algorithm,
    const std::string& object_placement_algorithm,
    const Params& params) {
    std::ostringstream key;
    key << recipe_engine_version << '|'
        << seed << '|'
        << width << 'x' << height << '|'
        << features.mountains << features.forests << features.trees << features.roads
        << features.caves << features.rivers << features.villages << '|'
        << terrain_algorithm << '|'
        << cave_algorithm << '|'
        << road_algorithm << '|'
        << object_placement_algorithm << '|'
        << params.water_level << '|'
        << params.mountain_level << '|'
        << params.forest_density << '|'
        << params.cave_density << '|'
        << params.road_complexity;
    return key.str();
}

} // namespace

const char* engine_version() {
    return "0.1.0";
}

std::string generate_map_json(
    const std::string& recipe_engine_version,
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
    double road_complexity) {
    const Features features{
        feature_mountains,
        feature_forests,
        feature_trees,
        feature_roads,
        feature_caves,
        feature_rivers,
        feature_villages,
    };
    const Params params{
        clamp01(water_level),
        clamp01(mountain_level),
        clamp01(forest_density),
        clamp01(cave_density),
        clamp01(road_complexity),
    };
    const std::string recipe_key = build_recipe_key(
        recipe_engine_version,
        seed,
        width,
        height,
        features,
        terrain_algorithm,
        cave_algorithm,
        road_algorithm,
        object_placement_algorithm,
        params);
    const std::uint64_t seed_key = fnv1a(recipe_key);
    std::vector<TileData> tiles;
    tiles.reserve(static_cast<std::size_t>(width * height));

    Stats stats;
    std::ostringstream hash_input;
    hash_input << recipe_key << '|';

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const double height_value = tile_height(terrain_algorithm, seed_key, x, y, width, height);
            const double forest_noise = unit_noise(seed_key, x, y, 0x27d4eb2full);
            const std::string terrain = classify_terrain(height_value, forest_noise, features, params);
            const bool blocked = is_blocked(terrain);
            const int cost = movement_cost(terrain);

            tiles.push_back(TileData{height_value, terrain, blocked, cost});
            hash_input << static_cast<int>(height_value * 10000.0) << ':' << terrain << ':' << blocked << ':' << cost << ';';

            if (terrain == "deep-water" || terrain == "water") {
                stats.water_count += 1;
            } else {
                stats.land_count += 1;
            }
            if (terrain == "forest") {
                stats.forest_count += 1;
            }
            if (terrain == "mountain") {
                stats.mountain_count += 1;
            }
            if (blocked) {
                stats.blocked_count += 1;
            }
        }
    }

    const int tile_count = std::max(1, width * height);
    const std::string map_hash = hash_hex(fnv1a(hash_input.str()));

    std::ostringstream json;
    json << std::fixed << std::setprecision(4);
    json << "{";
    json << "\"width\":" << width << ",";
    json << "\"height\":" << height << ",";

    json << "\"heightMap\":[";
    for (std::size_t index = 0; index < tiles.size(); ++index) {
        if (index > 0) {
            json << ",";
        }
        json << tiles[index].height;
    }
    json << "],";

    json << "\"terrainMap\":[";
    for (std::size_t index = 0; index < tiles.size(); ++index) {
        if (index > 0) {
            json << ",";
        }
        json << "\"" << json_escape(tiles[index].terrain) << "\"";
    }
    json << "],";

    json << "\"objectList\":[],";

    json << "\"collisionMap\":[";
    for (std::size_t index = 0; index < tiles.size(); ++index) {
        if (index > 0) {
            json << ",";
        }
        json << bool_json(tiles[index].blocked);
    }
    json << "],";

    json << "\"costMap\":[";
    for (std::size_t index = 0; index < tiles.size(); ++index) {
        if (index > 0) {
            json << ",";
        }
        json << tiles[index].cost;
    }
    json << "],";

    json << "\"portalList\":[],";
    json << "\"stats\":{";
    json << "\"waterRatio\":" << static_cast<double>(stats.water_count) / tile_count << ",";
    json << "\"landRatio\":" << static_cast<double>(stats.land_count) / tile_count << ",";
    json << "\"forestRatio\":" << static_cast<double>(stats.forest_count) / tile_count << ",";
    json << "\"mountainRatio\":" << static_cast<double>(stats.mountain_count) / tile_count << ",";
    json << "\"treeCount\":0,";
    json << "\"roadLength\":0,";
    json << "\"caveAreaRatio\":0,";
    json << "\"villageCount\":0,";
    json << "\"blockedRatio\":" << static_cast<double>(stats.blocked_count) / tile_count << ",";
    json << "\"generationTimeMs\":0";
    json << "},";
    json << "\"mapHash\":\"" << map_hash << "\"";
    json << "}";

    return json.str();
}

} // namespace world_forge

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(world_forge_engine) {
    emscripten::function("engine_version", &world_forge::engine_version);
    emscripten::function("generate_map_json", &world_forge::generate_map_json);
}
#endif
