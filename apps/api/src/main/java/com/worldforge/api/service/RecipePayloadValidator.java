package com.worldforge.api.service;

import com.worldforge.api.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Component
public class RecipePayloadValidator {
    private static final int MIN_SIZE = 64;
    private static final int MAX_SIZE = 512;
    private static final long MIN_SEED = 0L;
    private static final long MAX_SEED = 4_294_967_295L;

    private static final Set<String> FEATURES = Set.of(
            "mountains",
            "forests",
            "trees",
            "roads",
            "caves",
            "rivers",
            "villages"
    );
    private static final Set<String> TERRAIN_ALGORITHMS = Set.of("noise-island", "radial-island");
    private static final Set<String> CAVE_ALGORITHMS = Set.of("cellular-automata", "random-walk");
    private static final Set<String> ROAD_ALGORITHMS = Set.of("astar", "simple-path");
    private static final Set<String> OBJECT_ALGORITHMS = Set.of("biome-density", "scatter");
    private static final Set<String> PARAMS = Set.of(
            "waterLevel",
            "mountainLevel",
            "forestDensity",
            "caveDensity",
            "roadComplexity"
    );
    private static final Set<String> RATIO_STATS = Set.of(
            "waterRatio",
            "landRatio",
            "forestRatio",
            "mountainRatio",
            "caveAreaRatio",
            "blockedRatio",
            "reachableAreaRatio"
    );
    private static final Set<String> COUNT_STATS = Set.of(
            "treeCount",
            "roadLength",
            "villageCount",
            "generationTimeMs"
    );

    public RecipePayload validate(JsonNode recipe, JsonNode stats, String mapHash, String thumbnailUrl) {
        List<String> details = new ArrayList<>();
        if (recipe == null || !recipe.isObject()) {
            details.add("recipe must be an object");
        }
        if (stats == null || !stats.isObject()) {
            details.add("stats must be an object");
        }
        validateMapHash(mapHash, details);

        if (!details.isEmpty()) {
            throw invalid(details);
        }

        String engineVersion = requiredText(recipe, "engineVersion", details);
        long seed = requiredLong(recipe, "seed", MIN_SEED, MAX_SEED, details);
        int width = requiredInt(recipe, "width", MIN_SIZE, MAX_SIZE, details);
        int height = requiredInt(recipe, "height", MIN_SIZE, MAX_SIZE, details);
        validateFeatures(recipe.get("features"), details);
        validateAlgorithms(recipe.get("algorithms"), details);
        validateParams(recipe.get("params"), details);
        validateStats(stats, details);

        if (!details.isEmpty()) {
            throw invalid(details);
        }

        return new RecipePayload(engineVersion, seed, width, height, recipe, stats, mapHash.trim(), emptyToNull(thumbnailUrl));
    }

    private void validateFeatures(JsonNode features, List<String> details) {
        if (features == null || !features.isObject()) {
            details.add("recipe.features must be an object");
            return;
        }
        for (String feature : FEATURES) {
            JsonNode value = features.get(feature);
            if (value == null || !value.isBoolean()) {
                details.add("recipe.features." + feature + " must be a boolean");
            }
        }
        for (String field : features.propertyNames()) {
            if (!FEATURES.contains(field)) {
                details.add("recipe.features." + field + " is not supported");
            }
        }
    }

    private void validateAlgorithms(JsonNode algorithms, List<String> details) {
        if (algorithms == null || !algorithms.isObject()) {
            details.add("recipe.algorithms must be an object");
            return;
        }
        requiredOneOf(algorithms, "terrain", TERRAIN_ALGORITHMS, details);
        requiredOneOf(algorithms, "cave", CAVE_ALGORITHMS, details);
        requiredOneOf(algorithms, "road", ROAD_ALGORITHMS, details);
        requiredOneOf(algorithms, "objectPlacement", OBJECT_ALGORITHMS, details);
        for (String field : algorithms.propertyNames()) {
            if (!Set.of("terrain", "cave", "road", "objectPlacement").contains(field)) {
                details.add("recipe.algorithms." + field + " is not supported");
            }
        }
    }

    private void validateParams(JsonNode params, List<String> details) {
        if (params == null || !params.isObject()) {
            details.add("recipe.params must be an object");
            return;
        }
        for (String param : PARAMS) {
            requiredDouble(params, param, 0.0, 1.0, details);
        }
        for (String field : params.propertyNames()) {
            if (!PARAMS.contains(field)) {
                details.add("recipe.params." + field + " is not supported");
            }
        }
    }

    private void validateStats(JsonNode stats, List<String> details) {
        for (String stat : RATIO_STATS) {
            JsonNode value = stats.get(stat);
            if (value != null) {
                requiredDouble(stats, stat, 0.0, 1.0, details);
            }
        }
        for (String stat : COUNT_STATS) {
            JsonNode value = stats.get(stat);
            if (value != null && (!value.isNumber() || value.doubleValue() < 0)) {
                details.add("stats." + stat + " must be a non-negative number");
            }
        }
    }

    private String requiredText(JsonNode node, String field, List<String> details) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            details.add("recipe." + field + " must be a non-empty string");
            return "";
        }
        return value.asText();
    }

    private long requiredLong(JsonNode node, String field, long min, long max, List<String> details) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToLong()) {
            details.add("recipe." + field + " must be an integer");
            return min;
        }
        long longValue = value.longValue();
        if (longValue < min || longValue > max) {
            details.add("recipe." + field + " must be between " + min + " and " + max);
        }
        return longValue;
    }

    private int requiredInt(JsonNode node, String field, int min, int max, List<String> details) {
        long value = requiredLong(node, field, min, max, details);
        return (int) value;
    }

    private void requiredDouble(JsonNode node, String field, double min, double max, List<String> details) {
        JsonNode value = node.get(field);
        if (value == null || !value.isNumber()) {
            details.add("recipe.params." + field + " must be a number");
            return;
        }
        double doubleValue = value.doubleValue();
        if (!Double.isFinite(doubleValue) || doubleValue < min || doubleValue > max) {
            details.add(field + " must be between " + min + " and " + max);
        }
    }

    private void requiredOneOf(JsonNode node, String field, Set<String> supported, List<String> details) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || !supported.contains(value.asText())) {
            details.add("recipe.algorithms." + field + " is not supported");
        }
    }

    private void validateMapHash(String mapHash, List<String> details) {
        if (mapHash == null || mapHash.isBlank()) {
            details.add("mapHash must be a non-empty string");
        } else if (mapHash.length() > 128) {
            details.add("mapHash must be 128 characters or fewer");
        }
    }

    private ApiException invalid(List<String> details) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_RECIPE", "Recipe payload validation failed", details);
    }

    private String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
