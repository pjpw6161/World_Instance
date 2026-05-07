#include "world_forge/engine.hpp"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <limits>
#include <queue>
#include <sstream>
#include <string>
#include <utility>
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

struct Point {
    int x = -1;
    int y = -1;
};

struct MapObject {
    std::string id;
    std::string type;
    std::string layer_id;
    int x = -1;
    int y = -1;
};

struct CavePlan {
    std::vector<Point> entrances;
    std::vector<Point> cave_tiles;
    std::vector<Point> wall_tiles;
    double area_ratio = 0.0;
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
        const double ring = std::sin(falloff * 10.5) * 0.035;
        return round4(clamp01(falloff * 0.88 + fine * 0.08 + ring));
    }

    const double ridge = unit_noise(seed_key, x / 9, y / 3, 0x9e21ac89ull);
    return round4(clamp01(falloff * 0.50 + coarse * 0.28 + fine * 0.14 + ridge * 0.08));
}

double effective_water_level(const Params& params) {
    return clamp01(0.18 + params.water_level * 0.46);
}

double mountain_threshold(const Features& features, const Params& params) {
    const double intensity = features.mountains ? params.mountain_level : 0.0;
    return clamp01(0.72 + (1.0 - intensity) * 0.22);
}

std::vector<double> smooth_heights(const std::vector<double>& source, int width, int height) {
    std::vector<double> result(source.size(), 0.0);
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const std::size_t index = static_cast<std::size_t>(y * width + x);
            double weighted_height = source[index] * 0.50;
            double total_weight = 0.50;
            for (int dy = -1; dy <= 1; ++dy) {
                for (int dx = -1; dx <= 1; ++dx) {
                    if (dx == 0 && dy == 0) {
                        continue;
                    }
                    const int next_x = x + dx;
                    const int next_y = y + dy;
                    if (next_x < 0 || next_y < 0 || next_x >= width || next_y >= height) {
                        continue;
                    }
                    const double weight = (std::abs(dx) + std::abs(dy) == 1) ? 0.10 : 0.025;
                    weighted_height += source[static_cast<std::size_t>(next_y * width + next_x)] * weight;
                    total_weight += weight;
                }
            }
            result[index] = round4(weighted_height / total_weight);
        }
    }
    return result;
}

void constrain_height_pair(
    std::vector<double>& next,
    const std::vector<double>& source,
    std::size_t left_index,
    std::size_t right_index,
    double max_diff) {
    const double left = source[left_index];
    const double right = source[right_index];
    if (left - right > max_diff) {
        next[left_index] = std::min(next[left_index], right + max_diff);
    } else if (right - left > max_diff) {
        next[right_index] = std::min(next[right_index], left + max_diff);
    }
}

std::vector<double> limit_height_slope(
    const std::vector<double>& source,
    int width,
    int height,
    double max_diff,
    int iterations) {
    std::vector<double> result = source;
    for (int iteration = 0; iteration < iterations; ++iteration) {
        std::vector<double> next = result;
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                const std::size_t index = static_cast<std::size_t>(y * width + x);
                if (x + 1 < width) {
                    constrain_height_pair(next, result, index, index + 1, max_diff);
                }
                if (y + 1 < height) {
                    constrain_height_pair(next, result, index, index + static_cast<std::size_t>(width), max_diff);
                }
            }
        }
        for (double& value : next) {
            value = round4(value);
        }
        result = std::move(next);
    }
    return result;
}

std::vector<double> apply_playable_clearing(
    const std::vector<double>& source,
    int width,
    int height,
    const std::vector<Point>& anchors,
    const Params& params) {
    std::vector<double> result = source;
    const int radius = std::max(3, static_cast<int>(std::round(std::min(width, height) * 0.055)));
    const double target = clamp01(effective_water_level(params) + 0.08);
    for (const Point& anchor : anchors) {
        if (anchor.x < 0 || anchor.y < 0) {
            continue;
        }
        for (int y = std::max(0, anchor.y - radius); y <= std::min(height - 1, anchor.y + radius); ++y) {
            for (int x = std::max(0, anchor.x - radius); x <= std::min(width - 1, anchor.x + radius); ++x) {
                const double distance = std::hypot(x - anchor.x, y - anchor.y);
                if (distance > radius) {
                    continue;
                }
                const double falloff = 1.0 - distance / radius;
                const double weight = falloff * falloff * 0.72;
                const std::size_t index = static_cast<std::size_t>(y * width + x);
                result[index] = round4(clamp01(result[index] * (1.0 - weight) + target * weight));
            }
        }
    }
    return result;
}

std::vector<double> create_playable_height_map(
    const std::string& terrain_algorithm,
    std::uint64_t seed_key,
    int width,
    int height,
    const Features& features,
    const Params& params) {
    std::vector<double> heights(static_cast<std::size_t>(width * height), 0.0);
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            heights[static_cast<std::size_t>(y * width + x)] = tile_height(terrain_algorithm, seed_key, x, y, width, height);
        }
    }

    const double mountain_intensity = features.mountains ? params.mountain_level : 0.0;
    const int smoothing_passes = 1 + static_cast<int>(std::round(params.water_level * 2.0 + (1.0 - mountain_intensity) * 2.0));
    for (int pass = 0; pass < smoothing_passes; ++pass) {
        heights = smooth_heights(heights, width, height);
    }

    const double lowland_bias = params.water_level * 0.06 + (1.0 - mountain_intensity) * 0.08;
    const double amplitude = 0.74 + mountain_intensity * 0.22 - params.water_level * 0.08;
    for (double& height_value : heights) {
        height_value = round4(clamp01(0.08 + height_value * amplitude - lowland_bias));
    }

    heights = limit_height_slope(heights, width, height, 0.10 + mountain_intensity * 0.10, 2);
    heights = apply_playable_clearing(heights, width, height, {Point{width / 2, height / 2}}, params);
    return limit_height_slope(heights, width, height, 0.09 + mountain_intensity * 0.10, 2);
}

std::string classify_terrain(
    double height,
    double forest_noise,
    const Features& features,
    const Params& params) {
    const double water_level = effective_water_level(params);
    if (height < water_level - 0.08) {
        return "deep-water";
    }
    if (height < water_level) {
        return "water";
    }
    if (height < water_level + 0.04) {
        return "sand";
    }
    if (features.mountains && height >= mountain_threshold(features, params)) {
        return "mountain";
    }
    if (features.forests && height > water_level + 0.08 && forest_noise < params.forest_density) {
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

Point find_walkable_tile(const std::vector<TileData>& tiles, int width, int height, int preferred_x, int preferred_y);
bool point_is_valid(const Point& point);
bool point_in_bounds(int width, int height, int x, int y);

void mark_road_tile(std::vector<TileData>& tiles, int width, int x, int y) {
    TileData& tile = tiles[static_cast<std::size_t>(y * width + x)];
    if (tile.blocked || tile.terrain == "mountain" || tile.terrain == "cave-floor" || tile.terrain == "cave-wall") {
        return;
    }
    tile.terrain = "road";
    tile.cost = movement_cost("road");
}

void mark_road_brush(std::vector<TileData>& tiles, int width, int height, int x, int y, int radius) {
    for (int dy = -radius; dy <= radius; ++dy) {
        for (int dx = -radius; dx <= radius; ++dx) {
            if (std::abs(dx) + std::abs(dy) > radius + 1) {
                continue;
            }
            const int nx = x + dx;
            const int ny = y + dy;
            if (!point_in_bounds(width, height, nx, ny)) {
                continue;
            }
            mark_road_tile(tiles, width, nx, ny);
        }
    }
}

bool point_in_bounds(int width, int height, int x, int y) {
    return x >= 0 && y >= 0 && x < width && y < height;
}

bool same_point(const Point& left, const Point& right) {
    return left.x == right.x && left.y == right.y;
}

bool contains_point(const std::vector<Point>& points, const Point& candidate) {
    return std::any_of(points.begin(), points.end(), [&](const Point& point) {
        return same_point(point, candidate);
    });
}

void push_unique_point(std::vector<Point>& points, Point candidate) {
    if (!contains_point(points, candidate)) {
        points.push_back(candidate);
    }
}

int road_step_cost(const TileData& tile) {
    if (tile.blocked || tile.terrain == "deep-water" || tile.terrain == "water" || tile.terrain == "cave-floor" || tile.terrain == "cave-wall") {
        return 1000000;
    }
    if (tile.terrain == "sand" || tile.terrain == "grass") {
        return 8;
    }
    if (tile.terrain == "forest") {
        return 18;
    }
    if (tile.terrain == "mountain") {
        return 120;
    }
    return std::max(2, tile.cost);
}

void carve_road_path(std::vector<TileData>& tiles, int width, int height, Point from, Point to, std::uint64_t seed_key) {
    int x = std::max(0, std::min(width - 1, from.x));
    int y = std::max(0, std::min(height - 1, from.y));
    const int target_x = std::max(0, std::min(width - 1, to.x));
    const int target_y = std::max(0, std::min(height - 1, to.y));
    const int max_steps = std::max(width + height, width * 2 + height * 2);
    for (int step = 0; step < max_steps && (x != target_x || y != target_y); ++step) {
        mark_road_brush(tiles, width, height, x, y, 1);
        const int dx = target_x - x;
        const int dy = target_y - y;
        const bool prefer_x = std::abs(dx) >= std::abs(dy);
        const double wobble = unit_noise(seed_key, x, y, 0xbadc0deull);
        if ((prefer_x && wobble > 0.18) || wobble > 0.78) {
            x += (dx > 0) ? 1 : (dx < 0 ? -1 : 0);
        } else {
            y += (dy > 0) ? 1 : (dy < 0 ? -1 : 0);
        }
        x = std::max(0, std::min(width - 1, x));
        y = std::max(0, std::min(height - 1, y));
    }
    mark_road_brush(tiles, width, height, target_x, target_y, 1);
}

void carve_cost_aware_road_path(std::vector<TileData>& tiles, int width, int height, Point from, Point to, std::uint64_t seed_key) {
    const Point start = find_walkable_tile(tiles, width, height, from.x, from.y);
    const Point goal = find_walkable_tile(tiles, width, height, to.x, to.y);
    if (!point_is_valid(start) || !point_is_valid(goal)) {
        carve_road_path(tiles, width, height, from, to, seed_key);
        return;
    }

    struct QueueNode {
        int priority;
        int cost;
        int index;
    };
    struct QueueCompare {
        bool operator()(const QueueNode& left, const QueueNode& right) const {
            return left.priority > right.priority;
        }
    };

    const int tile_count = width * height;
    const int start_index = start.y * width + start.x;
    const int goal_index = goal.y * width + goal.x;
    const int infinite = std::numeric_limits<int>::max() / 4;
    std::vector<int> costs(static_cast<std::size_t>(tile_count), infinite);
    std::vector<int> previous(static_cast<std::size_t>(tile_count), -1);
    std::priority_queue<QueueNode, std::vector<QueueNode>, QueueCompare> frontier;

    costs[static_cast<std::size_t>(start_index)] = 0;
    frontier.push(QueueNode{0, 0, start_index});

    constexpr int offsets[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    while (!frontier.empty()) {
        const QueueNode current = frontier.top();
        frontier.pop();
        if (current.index == goal_index) {
            break;
        }
        if (current.cost != costs[static_cast<std::size_t>(current.index)]) {
            continue;
        }
        const int x = current.index % width;
        const int y = current.index / width;
        for (const auto& offset : offsets) {
            const int nx = x + offset[0];
            const int ny = y + offset[1];
            if (!point_in_bounds(width, height, nx, ny)) {
                continue;
            }
            const int neighbor_index = ny * width + nx;
            const TileData& neighbor = tiles[static_cast<std::size_t>(neighbor_index)];
            const int step_cost = road_step_cost(neighbor);
            if (step_cost >= 1000000) {
                continue;
            }
            const int noise_bias = static_cast<int>(std::round(unit_noise(seed_key, nx, ny, 0xa51a7e55ull) * 3.0));
            const int next_cost = current.cost + step_cost + noise_bias;
            if (next_cost >= costs[static_cast<std::size_t>(neighbor_index)]) {
                continue;
            }
            costs[static_cast<std::size_t>(neighbor_index)] = next_cost;
            previous[static_cast<std::size_t>(neighbor_index)] = current.index;
            const int heuristic = (std::abs(goal.x - nx) + std::abs(goal.y - ny)) * 6;
            frontier.push(QueueNode{next_cost + heuristic, next_cost, neighbor_index});
        }
    }

    if (previous[static_cast<std::size_t>(goal_index)] < 0 && start_index != goal_index) {
        carve_road_path(tiles, width, height, from, to, seed_key);
        return;
    }

    int cursor = goal_index;
    int guard = 0;
    while (cursor >= 0 && guard <= tile_count) {
        const int x = cursor % width;
        const int y = cursor / width;
        mark_road_brush(tiles, width, height, x, y, 1);
        if (cursor == start_index) {
            break;
        }
        cursor = previous[static_cast<std::size_t>(cursor)];
        guard += 1;
    }
}

std::vector<Point> road_anchor_points(int width, int height, const std::vector<Point>& cave_entrances, const Params& params) {
    std::vector<Point> anchors = cave_entrances;
    anchors.push_back(Point{width / 2, height / 2});
    anchors.push_back(Point{std::max(1, width / 8), height / 2});
    anchors.push_back(Point{std::max(1, width - width / 8 - 1), height / 2});
    if (params.road_complexity >= 0.45) {
        anchors.push_back(Point{width / 2, std::max(1, height / 8)});
        anchors.push_back(Point{width / 2, std::max(1, height - height / 8 - 1)});
    }
    return anchors;
}

void apply_road_trails(
    std::vector<TileData>& tiles,
    int width,
    int height,
    const Features& features,
    const Params& params,
    const std::string& road_algorithm,
    const std::vector<Point>& cave_entrances,
    std::uint64_t seed_key) {
    if (!features.roads || params.road_complexity <= 0.08 || tiles.empty()) {
        return;
    }

    if (road_algorithm == "astar") {
        const std::vector<Point> anchors = road_anchor_points(width, height, cave_entrances, params);
        const Point hub = find_walkable_tile(tiles, width, height, width / 2, height / 2);
        for (const Point& anchor : anchors) {
            carve_cost_aware_road_path(tiles, width, height, hub, anchor, seed_key);
        }
        if (params.road_complexity >= 0.65) {
            for (std::size_t index = 1; index < anchors.size(); ++index) {
                carve_cost_aware_road_path(tiles, width, height, anchors[index - 1], anchors[index], seed_key ^ static_cast<std::uint64_t>(index));
            }
        }
        return;
    }

    const int center_x = width / 2;
    const int center_y = height / 2;
    const int jitter = 1 + static_cast<int>(std::round(params.road_complexity * 2.0));
    const int brush_radius = params.road_complexity >= 0.72 ? 1 : 0;
    for (int x = 0; x < width; ++x) {
        const int y = std::max(0, std::min(height - 1, center_y + static_cast<int>(std::round((unit_noise(seed_key, x, center_y, 0x4cf5ad43ull) - 0.5) * jitter))));
        mark_road_brush(tiles, width, height, x, y, brush_radius);
    }
    if (params.road_complexity >= 0.5) {
        for (int y = 0; y < height; ++y) {
            const int x = std::max(0, std::min(width - 1, center_x + static_cast<int>(std::round((unit_noise(seed_key, center_x, y, 0x95a2f11dull) - 0.5) * jitter))));
            mark_road_brush(tiles, width, height, x, y, brush_radius);
        }
    }
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

Point find_walkable_tile(const std::vector<TileData>& tiles, int width, int height, int preferred_x, int preferred_y) {
    const int start_x = std::max(0, std::min(width - 1, preferred_x));
    const int start_y = std::max(0, std::min(height - 1, preferred_y));
    const auto is_walkable_at = [&](int x, int y) {
        if (x < 0 || y < 0 || x >= width || y >= height) {
            return false;
        }
        return !tiles[static_cast<std::size_t>(y * width + x)].blocked;
    };

    if (is_walkable_at(start_x, start_y)) {
        return Point{start_x, start_y};
    }

    const int max_radius = std::max(width, height);
    for (int radius = 1; radius < max_radius; ++radius) {
        for (int y = start_y - radius; y <= start_y + radius; ++y) {
            for (int x = start_x - radius; x <= start_x + radius; ++x) {
                if (std::abs(x - start_x) != radius && std::abs(y - start_y) != radius) {
                    continue;
                }
                if (is_walkable_at(x, y)) {
                    return Point{x, y};
                }
            }
        }
    }

    return Point{};
}

bool point_is_valid(const Point& point) {
    return point.x >= 0 && point.y >= 0;
}

bool point_is_spaced(const std::vector<Point>& points, const Point& candidate, int min_distance) {
    for (const Point& point : points) {
        if (std::abs(point.x - candidate.x) + std::abs(point.y - candidate.y) < min_distance) {
            return false;
        }
    }
    return true;
}

std::vector<Point> cave_seed_points(
    const std::vector<TileData>& tiles,
    int width,
    int height,
    std::uint64_t seed_key,
    int count) {
    std::vector<Point> points;
    const int min_distance = std::max(6, std::min(width, height) / 7);
    const int center_x = width / 2;
    const int center_y = height / 2;
    const int attempts = std::max(16, count * 28);
    constexpr double pi = 3.14159265358979323846;
    for (int attempt = 0; attempt < attempts && static_cast<int>(points.size()) < count; ++attempt) {
        const double angle = unit_noise(seed_key, attempt, count, 0xc4a7e501ull) * pi * 2.0;
        const double radius = static_cast<double>(std::min(width, height)) * (0.08 + unit_noise(seed_key, attempt, count, 0xc4a7e502ull) * 0.34);
        const int x = std::max(2, std::min(width - 3, static_cast<int>(std::round(static_cast<double>(center_x) + std::cos(angle) * radius))));
        const int y = std::max(2, std::min(height - 3, static_cast<int>(std::round(static_cast<double>(center_y) + std::sin(angle) * radius))));
        const Point candidate = find_walkable_tile(tiles, width, height, x, y);
        if (point_is_valid(candidate) && point_is_spaced(points, candidate, min_distance)) {
            points.push_back(candidate);
        }
    }
    if (points.empty()) {
        const Point fallback = find_walkable_tile(tiles, width, height, center_x, center_y);
        if (point_is_valid(fallback)) {
            points.push_back(fallback);
        }
    }
    return points;
}

double cave_region_influence(const std::vector<Point>& centers, int x, int y, int radius) {
    double influence = 0.0;
    for (const Point& center : centers) {
        const double dx = static_cast<double>(x - center.x) / (static_cast<double>(radius) * 1.18);
        const double dy = static_cast<double>(y - center.y) / (static_cast<double>(radius) * 0.88);
        influence = std::max(influence, 1.0 - std::sqrt(dx * dx + dy * dy));
    }
    return clamp01(influence);
}

void carve_cave_brush(CavePlan& plan, int width, int height, const Point& center, int radius) {
    for (int dy = -radius; dy <= radius; ++dy) {
        for (int dx = -radius; dx <= radius; ++dx) {
            if (std::abs(dx) + std::abs(dy) > radius + 1) {
                continue;
            }
            const int x = center.x + dx;
            const int y = center.y + dy;
            if (!point_in_bounds(width, height, x, y)) {
                continue;
            }
            push_unique_point(plan.cave_tiles, Point{x, y});
        }
    }
}

Point cave_direction_step(int x, int y, int direction) {
    if (direction == 0) {
        return Point{x + 1, y};
    }
    if (direction == 1) {
        return Point{x, y + 1};
    }
    if (direction == 2) {
        return Point{x - 1, y};
    }
    return Point{x, y - 1};
}

bool cave_walkable_source_tile(const std::vector<TileData>& tiles, int width, int height, int x, int y) {
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) {
        return false;
    }
    const TileData& tile = tiles[static_cast<std::size_t>(y * width + x)];
    return tile.terrain != "deep-water" && tile.terrain != "water";
}

Point next_cave_walk_step(
    const std::vector<TileData>& tiles,
    int width,
    int height,
    int x,
    int y,
    int& direction) {
    for (int attempt = 0; attempt < 4; ++attempt) {
        const int candidate_direction = (direction + attempt) % 4;
        const Point next = cave_direction_step(x, y, candidate_direction);
        if (cave_walkable_source_tile(tiles, width, height, next.x, next.y)) {
            direction = candidate_direction;
            return next;
        }
    }
    direction = (direction + 1) % 4;
    return Point{x, y};
}

void add_cave_corridor_walls(CavePlan& plan, int width, int height, const Point& point, std::uint64_t seed_key) {
    constexpr int offsets[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    for (const auto& offset : offsets) {
        const int nx = point.x + offset[0];
        const int ny = point.y + offset[1];
        if (!point_in_bounds(width, height, nx, ny)) {
            continue;
        }
        if (unit_noise(seed_key, nx, ny, 0x5ca1ab1eull) < 0.58) {
            push_unique_point(plan.wall_tiles, Point{nx, ny});
        }
    }
}

void apply_cave_plan_to_tiles(std::vector<TileData>& tiles, int width, int height, const CavePlan& plan) {
    for (const Point& point : plan.wall_tiles) {
        if (!point_in_bounds(width, height, point.x, point.y) || contains_point(plan.cave_tiles, point)) {
            continue;
        }
        TileData& tile = tiles[static_cast<std::size_t>(point.y * width + point.x)];
        if (tile.terrain == "deep-water" || tile.terrain == "water") {
            continue;
        }
        tile.terrain = "cave-wall";
        tile.blocked = true;
        tile.cost = movement_cost(tile.terrain);
    }

    for (const Point& point : plan.cave_tiles) {
        if (!point_in_bounds(width, height, point.x, point.y)) {
            continue;
        }
        TileData& tile = tiles[static_cast<std::size_t>(point.y * width + point.x)];
        if (tile.terrain == "deep-water" || tile.terrain == "water") {
            continue;
        }
        tile.terrain = "cave-floor";
        tile.blocked = false;
        tile.cost = movement_cost(tile.terrain);
    }

    constexpr int boundary_offsets[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    for (const Point& point : plan.cave_tiles) {
        for (const auto& offset : boundary_offsets) {
            const Point boundary{point.x + offset[0], point.y + offset[1]};
            if (!point_in_bounds(width, height, boundary.x, boundary.y) || contains_point(plan.cave_tiles, boundary)) {
                continue;
            }
            TileData& tile = tiles[static_cast<std::size_t>(boundary.y * width + boundary.x)];
            if (tile.terrain == "deep-water" || tile.terrain == "water" || tile.terrain == "road") {
                continue;
            }
            tile.terrain = "cave-wall";
            tile.blocked = true;
            tile.cost = movement_cost(tile.terrain);
        }
    }

    for (const Point& entrance : plan.entrances) {
        if (!point_in_bounds(width, height, entrance.x, entrance.y)) {
            continue;
        }
        TileData& tile = tiles[static_cast<std::size_t>(entrance.y * width + entrance.x)];
        tile.terrain = "cave-floor";
        tile.blocked = false;
        tile.cost = movement_cost(tile.terrain);
    }
}

CavePlan create_cave_plan(
    const std::vector<TileData>& tiles,
    int width,
    int height,
    const Features& features,
    const Params& params,
    const std::string& cave_algorithm,
    std::uint64_t seed_key) {
    CavePlan plan;
    if (!features.caves || params.cave_density <= 0.02) {
        return plan;
    }

    const int tile_count = std::max(1, width * height);
    const int max_entrances = std::max(1, std::min(5, 1 + static_cast<int>(std::round(params.cave_density * 4.0))));
    const int min_distance = std::max(5, std::min(width, height) / 6);
    int cave_score_count = 0;

    if (cave_algorithm == "random-walk") {
        std::vector<bool> visited(static_cast<std::size_t>(tile_count), false);
        const int walker_count = std::max(1, std::min(max_entrances, 1 + static_cast<int>(std::round(params.cave_density * 3.0))));
        const std::vector<Point> starts = cave_seed_points(tiles, width, height, seed_key, walker_count);
        const int steps = std::max(48, static_cast<int>(std::round(static_cast<double>(std::min(width, height)) * (0.55 + params.cave_density * 0.85))));
        const int brush_radius = params.cave_density >= 0.72 ? 2 : 1;

        for (std::size_t walker_index = 0; walker_index < starts.size(); ++walker_index) {
            int x = starts[walker_index].x;
            int y = starts[walker_index].y;
            int direction = static_cast<int>(std::floor(unit_noise(seed_key, x, y, 0x99117dd3ull + static_cast<std::uint64_t>(walker_index)) * 4.0));
            for (int step = 0; step < steps; ++step) {
                visited[static_cast<std::size_t>(y * width + x)] = true;
                carve_cave_brush(plan, width, height, Point{x, y}, brush_radius);
                const Point candidate = find_walkable_tile(tiles, width, height, x, y);
                if (point_is_valid(candidate)
                    && point_is_spaced(plan.entrances, candidate, min_distance)
                    && static_cast<int>(plan.entrances.size()) < max_entrances
                    && step % std::max(8, steps / std::max(1, max_entrances)) == 0) {
                    plan.entrances.push_back(candidate);
                }

                const double turn = unit_noise(
                    seed_key,
                    x + step * 7,
                    y - step * 11,
                    0x99117dd3ull + static_cast<std::uint64_t>(walker_index * 97));
                if (turn < 0.22) {
                    direction = (direction + 3) % 4;
                } else if (turn < 0.46) {
                    direction = (direction + 1) % 4;
                } else if (turn > 0.94) {
                    direction = (direction + 2) % 4;
                }
                const Point next = next_cave_walk_step(tiles, width, height, x, y, direction);
                x = next.x;
                y = next.y;
            }
        }
        cave_score_count = std::max(static_cast<int>(std::count(visited.begin(), visited.end(), true)), static_cast<int>(plan.cave_tiles.size()));
    } else {
        const std::vector<Point> centers = cave_seed_points(tiles, width, height, seed_key, max_entrances);
        const int chamber_radius = std::max(8, static_cast<int>(std::round(static_cast<double>(std::min(width, height)) * (0.10 + params.cave_density * 0.10))));
        const double threshold = 0.86 - params.cave_density * 0.14;
        std::vector<bool> cave_mask(static_cast<std::size_t>(tile_count), false);
        std::vector<bool> open(static_cast<std::size_t>(tile_count), false);
        for (int y = 1; y < height - 1; ++y) {
            for (int x = 1; x < width - 1; ++x) {
                const TileData& tile = tiles[static_cast<std::size_t>(y * width + x)];
                if (tile.blocked || tile.terrain == "deep-water" || tile.terrain == "water") {
                    continue;
                }
                const double influence = cave_region_influence(centers, x, y, chamber_radius);
                if (influence <= 0.0) {
                    continue;
                }
                cave_mask[static_cast<std::size_t>(y * width + x)] = true;
                const double rocky_bias = (tile.terrain == "mountain" || tile.terrain == "forest") ? 0.06 : 0.0;
                const double score = unit_noise(seed_key, x / 3, y / 3, 0xca7e11a5ull) + rocky_bias;
                open[static_cast<std::size_t>(y * width + x)] = score + influence * 0.38 > threshold;
            }
        }
        for (int iteration = 0; iteration < 3; ++iteration) {
            std::vector<bool> next = open;
            for (int y = 1; y < height - 1; ++y) {
                for (int x = 1; x < width - 1; ++x) {
                    const int index = y * width + x;
                    const TileData& tile = tiles[static_cast<std::size_t>(index)];
                    if (!cave_mask[static_cast<std::size_t>(index)] || tile.blocked || tile.terrain == "deep-water" || tile.terrain == "water") {
                        next[static_cast<std::size_t>(index)] = false;
                        continue;
                    }
                    int neighbors = 0;
                    for (int dy = -1; dy <= 1; ++dy) {
                        for (int dx = -1; dx <= 1; ++dx) {
                            if (dx == 0 && dy == 0) {
                                continue;
                            }
                            if (open[static_cast<std::size_t>((y + dy) * width + (x + dx))]) {
                                neighbors += 1;
                            }
                        }
                    }
                    next[static_cast<std::size_t>(index)] = open[static_cast<std::size_t>(index)] ? neighbors >= 3 : neighbors >= 5;
                }
            }
            open = next;
        }
        for (const Point& center : centers) {
            carve_cave_brush(plan, width, height, center, std::max(2, static_cast<int>(std::round(static_cast<double>(chamber_radius) * 0.08))));
        }
        for (int y = 1; y < height - 1; ++y) {
            for (int x = 1; x < width - 1; ++x) {
                if (!open[static_cast<std::size_t>(y * width + x)]) {
                    continue;
                }
                push_unique_point(plan.cave_tiles, Point{x, y});
                cave_score_count += 1;
                if (unit_noise(seed_key, x, y, 0xe17aace5ull) > 0.82) {
                    const Point candidate = find_walkable_tile(tiles, width, height, x, y);
                    if (point_is_valid(candidate)
                        && point_is_spaced(plan.entrances, candidate, min_distance)
                        && static_cast<int>(plan.entrances.size()) < max_entrances) {
                        plan.entrances.push_back(candidate);
                    }
                }
            }
        }
    }

    if (plan.entrances.empty()) {
        const Point fallback = find_walkable_tile(tiles, width, height, width / 2, height / 2);
        if (point_is_valid(fallback)) {
            plan.entrances.push_back(fallback);
            push_unique_point(plan.cave_tiles, fallback);
        }
    }
    if (cave_score_count <= 0) {
        cave_score_count = static_cast<int>(plan.cave_tiles.size());
    }
    plan.area_ratio = clamp01(static_cast<double>(std::max(cave_score_count, static_cast<int>(plan.cave_tiles.size()))) / static_cast<double>(tile_count));
    return plan;
}

bool object_occupied(const std::vector<bool>& occupied, int width, int x, int y) {
    return occupied[static_cast<std::size_t>(y * width + x)];
}

void add_object(
    std::vector<MapObject>& objects,
    std::vector<bool>& occupied,
    std::vector<TileData>& tiles,
    int width,
    const std::string& type,
    int x,
    int y) {
    if (object_occupied(occupied, width, x, y)) {
        return;
    }
    const std::string id = type + "-" + std::to_string(objects.size() + 1);
    objects.push_back(MapObject{id, type, "surface", x, y});
    occupied[static_cast<std::size_t>(y * width + x)] = true;
    if (type == "tree" || type == "rock") {
        TileData& tile = tiles[static_cast<std::size_t>(y * width + x)];
        tile.blocked = true;
        tile.cost = 255;
    }
}

bool add_best_scatter_object(
    std::vector<MapObject>& objects,
    std::vector<bool>& occupied,
    std::vector<TileData>& tiles,
    int width,
    int height,
    const std::string& type,
    int ordinal,
    std::uint64_t seed_key) {
    Point best{-1, -1};
    double best_score = -1.0;
    const int stride = type == "tree" ? 5 : 8;
    for (int y = 2; y < height - 2; ++y) {
        for (int x = 2; x < width - 2; ++x) {
            if ((x + y + ordinal) % stride != 0 || object_occupied(occupied, width, x, y)) {
                continue;
            }
            const TileData& tile = tiles[static_cast<std::size_t>(y * width + x)];
            if (tile.blocked || tile.terrain == "water" || tile.terrain == "deep-water" || tile.terrain == "cave-wall") {
                continue;
            }
            if (type == "tree" && tile.terrain != "grass" && tile.terrain != "forest") {
                continue;
            }
            const double score = unit_noise(seed_key, x, y, 0x51ca77e5ull + static_cast<std::uint64_t>(ordinal));
            if (score > best_score) {
                best_score = score;
                best = Point{x, y};
            }
        }
    }
    if (!point_is_valid(best)) {
        return false;
    }
    add_object(objects, occupied, tiles, width, type, best.x, best.y);
    return true;
}

bool add_best_biome_object(
    std::vector<MapObject>& objects,
    std::vector<bool>& occupied,
    std::vector<TileData>& tiles,
    int width,
    int height,
    const std::string& type,
    int ordinal,
    std::uint64_t seed_key) {
    Point best{-1, -1};
    double best_score = -1.0;
    for (int y = 2; y < height - 2; ++y) {
        for (int x = 2; x < width - 2; ++x) {
            if (object_occupied(occupied, width, x, y)) {
                continue;
            }
            const TileData& tile = tiles[static_cast<std::size_t>(y * width + x)];
            if (tile.blocked || tile.terrain == "water" || tile.terrain == "deep-water" || tile.terrain == "cave-wall") {
                continue;
            }
            if (type == "tree" && tile.terrain != "forest") {
                continue;
            }
            const double cluster_score = unit_noise(seed_key, x / 7, y / 7, 0xb10bed00ull);
            const double local_score = unit_noise(seed_key, x, y, 0x77ee0001ull + static_cast<std::uint64_t>(ordinal)) * 0.25;
            const double score = cluster_score + local_score;
            if (score > best_score) {
                best_score = score;
                best = Point{x, y};
            }
        }
    }
    if (!point_is_valid(best)) {
        return false;
    }
    add_object(objects, occupied, tiles, width, type, best.x, best.y);
    return true;
}

struct ObjectCandidate {
    int x;
    int y;
    double score;
};

bool object_candidate_tile(const TileData& tile) {
    return !tile.blocked
        && tile.terrain != "water"
        && tile.terrain != "deep-water"
        && tile.terrain != "cave-floor"
        && tile.terrain != "cave-wall";
}

int scaled_target(int max, double density, double weight) {
    if (max <= 0) {
        return 0;
    }
    return std::max(0, std::min(max, static_cast<int>(std::round(static_cast<double>(max) * clamp01(density) * weight))));
}

bool spaced_from_points(const std::vector<Point>& points, const ObjectCandidate& candidate, int min_distance) {
    const int min_distance_squared = min_distance * min_distance;
    return std::all_of(points.begin(), points.end(), [&](const Point& point) {
        const int dx = point.x - candidate.x;
        const int dy = point.y - candidate.y;
        return dx * dx + dy * dy >= min_distance_squared;
    });
}

int add_ranked_objects(
    std::vector<MapObject>& objects,
    std::vector<bool>& occupied,
    std::vector<TileData>& tiles,
    int width,
    const std::string& type,
    std::vector<ObjectCandidate> candidates,
    int target,
    int min_distance) {
    if (target <= 0 || candidates.empty()) {
        return 0;
    }
    std::sort(candidates.begin(), candidates.end(), [](const ObjectCandidate& left, const ObjectCandidate& right) {
        return left.score > right.score;
    });

    std::vector<Point> selected;
    int placed = 0;
    for (const ObjectCandidate& candidate : candidates) {
        if (placed >= target) {
            break;
        }
        if (object_occupied(occupied, width, candidate.x, candidate.y) || !spaced_from_points(selected, candidate, min_distance)) {
            continue;
        }
        add_object(objects, occupied, tiles, width, type, candidate.x, candidate.y);
        selected.push_back(Point{candidate.x, candidate.y});
        placed += 1;
    }

    if (placed >= std::min(target, 8) || min_distance <= 1) {
        return placed;
    }
    return placed + add_ranked_objects(objects, occupied, tiles, width, type, std::move(candidates), target - placed, std::max(1, min_distance / 2));
}

std::vector<ObjectCandidate> tree_candidates(
    const std::vector<TileData>& tiles,
    int width,
    int height,
    const std::string& object_placement_algorithm,
    std::uint64_t seed_key) {
    std::vector<ObjectCandidate> candidates;
    const bool biome_mode = object_placement_algorithm == "biome-density";
    const int stride = (width >= 512 || height >= 512) ? 2 : 1;
    for (int y = 2; y < height - 2; ++y) {
        const int start_x = 2 + static_cast<int>((seed_key + static_cast<std::uint64_t>(y) * 17ull) % static_cast<std::uint64_t>(stride));
        for (int x = start_x; x < width - 2; x += stride) {
            const TileData& tile = tiles[static_cast<std::size_t>(y * width + x)];
            if (!object_candidate_tile(tile)) {
                continue;
            }
            if (biome_mode && tile.terrain != "forest") {
                continue;
            }
            if (!biome_mode && tile.terrain != "forest" && tile.terrain != "grass") {
                continue;
            }
            const double biome_score = biome_mode ? unit_noise(seed_key, x / 18, y / 18, 0xb10bed00ull) * 0.72 : 0.0;
            const double spread_score = unit_noise(seed_key, x, y, biome_mode ? 0x77ee0001ull : 0x51ca77e5ull);
            const double terrain_score = tile.terrain == "forest" ? 0.22 : 0.0;
            candidates.push_back(ObjectCandidate{x, y, biome_score + spread_score + terrain_score});
        }
    }
    return candidates;
}

std::vector<ObjectCandidate> rock_candidates(const std::vector<TileData>& tiles, int width, int height, std::uint64_t seed_key) {
    std::vector<ObjectCandidate> candidates;
    const int stride = (width >= 512 || height >= 512) ? 2 : 1;
    for (int y = 2; y < height - 2; ++y) {
        const int start_x = 2 + static_cast<int>((seed_key + static_cast<std::uint64_t>(y) * 17ull) % static_cast<std::uint64_t>(stride));
        for (int x = start_x; x < width - 2; x += stride) {
            const TileData& tile = tiles[static_cast<std::size_t>(y * width + x)];
            if (!object_candidate_tile(tile) || tile.terrain != "mountain") {
                continue;
            }
            const double ridge_score = unit_noise(seed_key, x / 12, y / 12, 0x70cce000ull) * 0.5;
            const double local_score = unit_noise(seed_key, x, y, 0x70cce777ull);
            candidates.push_back(ObjectCandidate{x, y, ridge_score + local_score});
        }
    }
    return candidates;
}

std::vector<ObjectCandidate> village_candidates(const std::vector<TileData>& tiles, int width, int height, std::uint64_t seed_key) {
    std::vector<ObjectCandidate> candidates;
    const int stride = (width >= 512 || height >= 512) ? 2 : 1;
    for (int y = 2; y < height - 2; ++y) {
        const int start_x = 2 + static_cast<int>((seed_key + static_cast<std::uint64_t>(y) * 17ull) % static_cast<std::uint64_t>(stride));
        for (int x = start_x; x < width - 2; x += stride) {
            const TileData& tile = tiles[static_cast<std::size_t>(y * width + x)];
            if (!object_candidate_tile(tile) || (tile.terrain != "grass" && tile.terrain != "road")) {
                continue;
            }
            const double road_score = tile.terrain == "road" ? 0.45 : 0.0;
            const double local_score = unit_noise(seed_key, x, y, 0x711a9e55ull);
            candidates.push_back(ObjectCandidate{x, y, road_score + local_score});
        }
    }
    return candidates;
}

std::vector<MapObject> place_objects(
    std::vector<TileData>& tiles,
    int width,
    int height,
    const Features& features,
    const Params& params,
    const std::string& object_placement_algorithm,
    const std::vector<Point>& cave_entrances,
    std::uint64_t seed_key) {
    std::vector<MapObject> objects;
    std::vector<bool> occupied(static_cast<std::size_t>(width * height), false);

    for (const Point& entrance : cave_entrances) {
        if (point_is_valid(entrance)) {
            add_object(objects, occupied, tiles, width, "cave-entrance", entrance.x, entrance.y);
        }
    }

    const int tile_count = std::max(1, width * height);
    const int max_trees = features.trees ? std::max(8, std::min(1600, tile_count / 64)) : 0;
    const int max_rocks = features.mountains ? std::max(4, std::min(520, tile_count / 180)) : 0;
    const int max_villages = features.villages ? std::max(1, std::min(8, tile_count / 9000 + 1)) : 0;
    const int tree_target = scaled_target(max_trees, params.forest_density, object_placement_algorithm == "biome-density" ? 0.9 : 0.7);
    const int rock_target = scaled_target(max_rocks, params.mountain_level, 0.55);
    const int village_target = scaled_target(max_villages, params.forest_density, 0.65);

    add_ranked_objects(objects, occupied, tiles, width, "tree", tree_candidates(tiles, width, height, object_placement_algorithm, seed_key), tree_target, object_placement_algorithm == "biome-density" ? 3 : 8);
    add_ranked_objects(objects, occupied, tiles, width, "rock", rock_candidates(tiles, width, height, seed_key), rock_target, object_placement_algorithm == "biome-density" ? 4 : 10);
    add_ranked_objects(objects, occupied, tiles, width, "village", village_candidates(tiles, width, height, seed_key), village_target, 18);

    return objects;
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

std::string engine_version() {
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
    std::vector<double> height_values = create_playable_height_map(
        terrain_algorithm,
        seed_key,
        width,
        height,
        features,
        params);
    std::vector<TileData> tiles;
    tiles.reserve(static_cast<std::size_t>(width * height));

    Stats stats;

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const double height_value = height_values[static_cast<std::size_t>(y * width + x)];
            const double forest_noise = unit_noise(seed_key, x, y, 0x27d4eb2full);
            const std::string terrain = classify_terrain(height_value, forest_noise, features, params);
            const bool blocked = is_blocked(terrain);
            const int cost = movement_cost(terrain);

            tiles.push_back(TileData{height_value, terrain, blocked, cost});
        }
    }

    const CavePlan cave_plan = create_cave_plan(tiles, width, height, features, params, cave_algorithm, seed_key);
    apply_cave_plan_to_tiles(tiles, width, height, cave_plan);
    apply_road_trails(tiles, width, height, features, params, road_algorithm, cave_plan.entrances, seed_key);
    if (!cave_plan.entrances.empty()) {
        height_values = apply_playable_clearing(height_values, width, height, cave_plan.entrances, params);
        const double mountain_intensity = features.mountains ? params.mountain_level : 0.0;
        height_values = limit_height_slope(height_values, width, height, 0.09 + mountain_intensity * 0.10, 2);
        for (std::size_t index = 0; index < tiles.size(); ++index) {
            tiles[index].height = height_values[index];
        }
    }
    std::vector<MapObject> objects = place_objects(
        tiles,
        width,
        height,
        features,
        params,
        object_placement_algorithm,
        cave_plan.entrances,
        seed_key);

    std::ostringstream hash_input;
    hash_input << recipe_key << '|';
    int road_length = 0;
    for (const TileData& tile : tiles) {
        hash_input << static_cast<int>(tile.height * 10000.0) << ':' << tile.terrain << ':' << tile.blocked << ':' << tile.cost << ';';

        if (tile.terrain == "deep-water" || tile.terrain == "water") {
            stats.water_count += 1;
        } else {
            stats.land_count += 1;
        }
        if (tile.terrain == "forest") {
            stats.forest_count += 1;
        }
        if (tile.terrain == "mountain") {
            stats.mountain_count += 1;
        }
        if (tile.terrain == "road") {
            road_length += 1;
        }
        if (tile.blocked) {
            stats.blocked_count += 1;
        }
    }
    hash_input << "objects|";
    int tree_count = 0;
    int village_count = 0;
    for (const MapObject& object : objects) {
        hash_input << object.type << ':' << object.layer_id << ':' << object.x << ':' << object.y << ';';
        if (object.type == "tree") {
            tree_count += 1;
        }
        if (object.type == "village") {
            village_count += 1;
        }
    }
    hash_input << "portals|";
    for (std::size_t index = 0; index < cave_plan.entrances.size(); ++index) {
        const Point& entrance = cave_plan.entrances[index];
        hash_input << index << ':' << entrance.x << ':' << entrance.y << ';';
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

    json << "\"objectList\":[";
    for (std::size_t index = 0; index < objects.size(); ++index) {
        if (index > 0) {
            json << ",";
        }
        const MapObject& object = objects[index];
        json << "{\"id\":\"" << json_escape(object.id) << "\",";
        json << "\"type\":\"" << json_escape(object.type) << "\",";
        json << "\"layerId\":\"" << json_escape(object.layer_id) << "\",";
        json << "\"x\":" << object.x << ",\"y\":" << object.y << "}";
    }
    json << "],";

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

    json << "\"portalList\":";
    if (!cave_plan.entrances.empty()) {
        json << "[";
        for (std::size_t index = 0; index < cave_plan.entrances.size(); ++index) {
            if (index > 0) {
                json << ",";
            }
            const Point& entrance = cave_plan.entrances[index];
            json << "{\"id\":\"surface-cave-entrance-" << index << "\",\"fromLayerId\":\"surface\",\"toLayerId\":\"cave\",";
            json << "\"x\":" << entrance.x << ",\"y\":" << entrance.y << ",";
            json << "\"targetX\":" << entrance.x << ",\"targetY\":" << entrance.y << "},";
            json << "{\"id\":\"cave-surface-exit-" << index << "\",\"fromLayerId\":\"cave\",\"toLayerId\":\"surface\",";
            json << "\"x\":" << entrance.x << ",\"y\":" << entrance.y << ",";
            json << "\"targetX\":" << entrance.x << ",\"targetY\":" << entrance.y << "}";
        }
        json << "],";
    } else {
        json << "[],";
    }
    json << "\"stats\":{";
    json << "\"waterRatio\":" << static_cast<double>(stats.water_count) / tile_count << ",";
    json << "\"landRatio\":" << static_cast<double>(stats.land_count) / tile_count << ",";
    json << "\"forestRatio\":" << static_cast<double>(stats.forest_count) / tile_count << ",";
    json << "\"mountainRatio\":" << static_cast<double>(stats.mountain_count) / tile_count << ",";
    json << "\"treeCount\":" << tree_count << ",";
    json << "\"roadLength\":" << road_length << ",";
    json << "\"caveAreaRatio\":" << cave_plan.area_ratio << ",";
    json << "\"villageCount\":" << village_count << ",";
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
