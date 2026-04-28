package com.worldforge.api.search;

import com.worldforge.api.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class MapSearchRequestParser {
    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 50;

    private static final Set<String> FEATURES = Set.of(
            "mountains",
            "forests",
            "trees",
            "roads",
            "caves",
            "rivers",
            "villages"
    );
    private static final Set<String> MAP_TYPES = Set.of("mixed", "forest", "mountain", "archipelago", "cave");
    private static final Set<String> TERRAIN_ALGORITHMS = Set.of("noise-island", "radial-island");
    private static final Set<String> CAVE_ALGORITHMS = Set.of("cellular-automata", "random-walk");
    private static final Set<String> ROAD_ALGORITHMS = Set.of("astar", "simple-path");
    private static final Set<String> OBJECT_ALGORITHMS = Set.of("biome-density", "scatter");
    private static final Set<String> LIVING_ACTIVITIES = Set.of("quiet", "inhabited", "dense");
    private static final List<String> STAT_FIELDS = List.of(
            "waterRatio",
            "landRatio",
            "forestRatio",
            "mountainRatio",
            "caveAreaRatio",
            "blockedRatio",
            "reachableAreaRatio",
            "treeCount",
            "roadLength",
            "villageCount",
            "creatureCount",
            "surfaceCreatureCount",
            "caveCreatureCount",
            "portalCount",
            "npcCount",
            "generationTimeMs"
    );
    private static final List<String> LIVING_STAT_FIELDS = List.of(
            "creatureCount",
            "surfaceCreatureCount",
            "caveCreatureCount",
            "reachableAreaRatio",
            "portalCount",
            "livingDensity",
            "creatureDensity"
    );
    private static final Set<String> ALLOWED_PARAMS = Set.of(
            "keyword",
            "mapType",
            "features",
            "terrainAlgorithm",
            "caveAlgorithm",
            "roadAlgorithm",
            "objectPlacementAlgorithm",
            "livingActivity",
            "minWidth",
            "maxWidth",
            "minHeight",
            "maxHeight",
            "page",
            "size",
            "minWaterRatio",
            "maxWaterRatio",
            "minLandRatio",
            "maxLandRatio",
            "minForestRatio",
            "maxForestRatio",
            "minMountainRatio",
            "maxMountainRatio",
            "minCaveAreaRatio",
            "maxCaveAreaRatio",
            "minBlockedRatio",
            "maxBlockedRatio",
            "minReachableAreaRatio",
            "maxReachableAreaRatio",
            "minTreeCount",
            "maxTreeCount",
            "minRoadLength",
            "maxRoadLength",
            "minVillageCount",
            "maxVillageCount",
            "minCreatureCount",
            "maxCreatureCount",
            "minSurfaceCreatureCount",
            "maxSurfaceCreatureCount",
            "minCaveCreatureCount",
            "maxCaveCreatureCount",
            "minPortalCount",
            "maxPortalCount",
            "minNpcCount",
            "maxNpcCount",
            "minLivingDensity",
            "maxLivingDensity",
            "minCreatureDensity",
            "maxCreatureDensity",
            "minGenerationTimeMs",
            "maxGenerationTimeMs"
    );
    private static final Set<String> SIMILAR_ALLOWED_PARAMS = Set.of("size");

    public MapSearchRequest parse(MultiValueMap<String, String> params) {
        List<String> details = new ArrayList<>();
        for (String key : params.keySet()) {
            if (!ALLOWED_PARAMS.contains(key)) {
                details.add(key + " is not a supported search parameter");
            }
        }

        String keyword = optionalText(params, "keyword");
        String mapType = optionalEnum(params, "mapType", MAP_TYPES, details);
        List<String> features = featureList(params, details);
        String terrainAlgorithm = optionalEnum(params, "terrainAlgorithm", TERRAIN_ALGORITHMS, details);
        String caveAlgorithm = optionalEnum(params, "caveAlgorithm", CAVE_ALGORITHMS, details);
        String roadAlgorithm = optionalEnum(params, "roadAlgorithm", ROAD_ALGORITHMS, details);
        String objectPlacementAlgorithm = optionalEnum(params, "objectPlacementAlgorithm", OBJECT_ALGORITHMS, details);
        String livingActivity = optionalEnum(params, "livingActivity", LIVING_ACTIVITIES, details);
        Integer minWidth = optionalInteger(params, "minWidth", details);
        Integer maxWidth = optionalInteger(params, "maxWidth", details);
        Integer minHeight = optionalInteger(params, "minHeight", details);
        Integer maxHeight = optionalInteger(params, "maxHeight", details);
        int page = boundedInteger(params, "page", 0, 10_000, 0, details);
        int size = boundedInteger(params, "size", 1, MAX_SIZE, DEFAULT_SIZE, details);
        Map<String, NumericRange> stats = statRanges(params, details);
        Map<String, NumericRange> livingStats = livingStatRanges(params, details);

        validateMinMax("width", minWidth, maxWidth, details);
        validateMinMax("height", minHeight, maxHeight, details);
        for (Map.Entry<String, NumericRange> entry : stats.entrySet()) {
            validateMinMax(entry.getKey(), entry.getValue().min(), entry.getValue().max(), details);
        }
        for (Map.Entry<String, NumericRange> entry : livingStats.entrySet()) {
            validateMinMax("livingStats." + entry.getKey(), entry.getValue().min(), entry.getValue().max(), details);
        }

        if (!details.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SEARCH_REQUEST", "Search request validation failed", details);
        }

        return new MapSearchRequest(
                keyword,
                mapType,
                features,
                terrainAlgorithm,
                caveAlgorithm,
                roadAlgorithm,
                objectPlacementAlgorithm,
                livingActivity,
                minWidth,
                maxWidth,
                minHeight,
                maxHeight,
                stats,
                livingStats,
                page,
                size
        );
    }

    public int parseSimilarSize(MultiValueMap<String, String> params) {
        List<String> details = new ArrayList<>();
        for (String key : params.keySet()) {
            if (!SIMILAR_ALLOWED_PARAMS.contains(key)) {
                details.add(key + " is not a supported similar maps parameter");
            }
        }
        int size = boundedInteger(params, "size", 1, MAX_SIZE, 10, details);
        if (!details.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SIMILAR_MAPS_REQUEST", "Similar maps request validation failed", details);
        }
        return size;
    }

    private List<String> featureList(MultiValueMap<String, String> params, List<String> details) {
        List<String> features = new ArrayList<>();
        for (String value : params.getOrDefault("features", List.of())) {
            for (String feature : value.split(",")) {
                String normalized = feature.trim();
                if (normalized.isEmpty()) {
                    continue;
                }
                if (!FEATURES.contains(normalized)) {
                    details.add("features." + normalized + " is not supported");
                    continue;
                }
                if (!features.contains(normalized)) {
                    features.add(normalized);
                }
            }
        }
        return features;
    }

    private Map<String, NumericRange> statRanges(MultiValueMap<String, String> params, List<String> details) {
        Map<String, NumericRange> ranges = new LinkedHashMap<>();
        for (String stat : STAT_FIELDS) {
            Double min = optionalDouble(params, "min" + upperFirst(stat), details);
            Double max = optionalDouble(params, "max" + upperFirst(stat), details);
            if (min != null || max != null) {
                ranges.put(stat, new NumericRange(min, max));
            }
        }
        return ranges;
    }

    private Map<String, NumericRange> livingStatRanges(MultiValueMap<String, String> params, List<String> details) {
        Map<String, NumericRange> ranges = new LinkedHashMap<>();
        for (String stat : LIVING_STAT_FIELDS) {
            Double min = optionalDouble(params, "min" + upperFirst(stat), details);
            Double max = optionalDouble(params, "max" + upperFirst(stat), details);
            if (min != null || max != null) {
                ranges.put(stat, new NumericRange(min, max));
            }
        }
        return ranges;
    }

    private String optionalEnum(MultiValueMap<String, String> params, String key, Set<String> allowed, List<String> details) {
        String value = optionalText(params, key);
        if (value == null) {
            return null;
        }
        if (!allowed.contains(value)) {
            details.add(key + " is not supported");
        }
        return value;
    }

    private String optionalText(MultiValueMap<String, String> params, String key) {
        String value = params.getFirst(key);
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private Integer optionalInteger(MultiValueMap<String, String> params, String key, List<String> details) {
        String value = optionalText(params, key);
        if (value == null) {
            return null;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            details.add(key + " must be an integer");
            return null;
        }
    }

    private int boundedInteger(
            MultiValueMap<String, String> params,
            String key,
            int min,
            int max,
            int fallback,
            List<String> details
    ) {
        Integer value = optionalInteger(params, key, details);
        if (value == null) {
            return fallback;
        }
        if (value < min || value > max) {
            details.add(key + " must be between " + min + " and " + max);
            return fallback;
        }
        return value;
    }

    private Double optionalDouble(MultiValueMap<String, String> params, String key, List<String> details) {
        String value = optionalText(params, key);
        if (value == null) {
            return null;
        }
        try {
            double parsed = Double.parseDouble(value);
            if (!Double.isFinite(parsed)) {
                details.add(key + " must be finite");
                return null;
            }
            return parsed;
        } catch (NumberFormatException exception) {
            details.add(key + " must be a number");
            return null;
        }
    }

    private void validateMinMax(String field, Number min, Number max, List<String> details) {
        if (min != null && max != null && min.doubleValue() > max.doubleValue()) {
            details.add(field + " min must be less than or equal to max");
        }
    }

    private String upperFirst(String value) {
        return value.substring(0, 1).toUpperCase() + value.substring(1);
    }
}
