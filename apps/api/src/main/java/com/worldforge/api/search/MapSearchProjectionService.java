package com.worldforge.api.search;

import com.worldforge.api.domain.MapProject;
import com.worldforge.api.domain.MapVersion;
import com.worldforge.api.domain.MapVisibility;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class MapSearchProjectionService {
    private static final Logger logger = LoggerFactory.getLogger(MapSearchProjectionService.class);
    private static final double MAX_MAP_SIZE = 512.0;

    private final MapSearchIndexClient indexClient;
    private final ObjectMapper objectMapper;

    public MapSearchProjectionService(MapSearchIndexClient indexClient, ObjectMapper objectMapper) {
        this.indexClient = indexClient;
        this.objectMapper = objectMapper;
    }

    public void syncProject(MapProject project, MapVersion currentVersion) {
        if (project.getVisibility() != MapVisibility.PUBLIC || currentVersion == null) {
            removeProject(project.getId());
            return;
        }
        MapSearchDocument document = toDocument(project, currentVersion);
        afterCommit(() -> indexClient.index(document));
    }

    public void removeProject(UUID projectId) {
        afterCommit(() -> indexClient.delete(projectId));
    }

    public void removeProjectImmediately(UUID projectId) {
        indexClient.delete(projectId);
    }

    public MapSearchDocument toDocument(MapProject project, MapVersion version) {
        JsonNode recipe = readJson(version.getRecipeJson());
        JsonNode stats = readJson(version.getStatsJson());
        Map<String, Double> livingStats = livingStats(stats, version.getWidth(), version.getHeight());
        return new MapSearchDocument(
                project.getId(),
                version.getId(),
                project.getOwner().getId(),
                project.getTitle(),
                project.getDescription(),
                mapType(stats),
                version.getMapHash(),
                version.getEngineVersion(),
                version.getSeed(),
                version.getWidth(),
                version.getHeight(),
                enabledFeatures(recipe.get("features")),
                textAt(recipe.get("algorithms"), "terrain", ""),
                textAt(recipe.get("algorithms"), "cave", ""),
                textAt(recipe.get("algorithms"), "road", ""),
                textAt(recipe.get("algorithms"), "objectPlacement", ""),
                livingActivity(livingStats),
                numericStats(stats, livingStats),
                livingStats,
                mapDna(stats, livingStats, version.getWidth(), version.getHeight()),
                project.getCreatedAt(),
                project.getUpdatedAt()
        );
    }

    private List<String> enabledFeatures(JsonNode features) {
        if (features == null || !features.isObject()) {
            return List.of();
        }
        List<String> enabled = new ArrayList<>();
        for (String field : features.propertyNames()) {
            JsonNode value = features.get(field);
            if (value != null && value.isBoolean() && value.booleanValue()) {
                enabled.add(field);
            }
        }
        enabled.sort(String::compareTo);
        return enabled;
    }

    private Map<String, Double> numericStats(JsonNode stats, Map<String, Double> livingStats) {
        Map<String, Double> values = new LinkedHashMap<>();
        if (stats == null || !stats.isObject()) {
            return values;
        }
        for (String field : stats.propertyNames()) {
            JsonNode value = stats.get(field);
            if (value != null && value.isNumber()) {
                values.put(field, value.doubleValue());
            }
        }
        copyIfPresent(values, livingStats, "creatureCount");
        copyIfPresent(values, livingStats, "surfaceCreatureCount");
        copyIfPresent(values, livingStats, "caveCreatureCount");
        copyIfPresent(values, livingStats, "portalCount");
        copyIfPresent(values, livingStats, "reachableAreaRatio");
        copyIfPresent(values, livingStats, "npcCount");
        return values;
    }

    private Map<String, Double> livingStats(JsonNode stats, int width, int height) {
        Map<String, Double> values = new LinkedHashMap<>();
        if (stats == null || !stats.isObject()) {
            return values;
        }
        JsonNode livingStats = stats.get("livingStats");
        if (livingStats != null && livingStats.isObject()) {
            for (String field : livingStats.propertyNames()) {
                JsonNode value = livingStats.get(field);
                if (value != null && value.isNumber()) {
                    values.put(field, Math.max(0.0, value.doubleValue()));
                }
            }
        }
        copyNumeric(stats, values, "creatureCount");
        copyNumeric(stats, values, "surfaceCreatureCount");
        copyNumeric(stats, values, "caveCreatureCount");
        copyNumeric(stats, values, "portalCount");
        copyNumeric(stats, values, "npcCount");
        copyNumeric(stats, values, "reachableAreaRatio");

        double area = Math.max(1.0, (double) width * height);
        double surfaceCreatureCount = values.getOrDefault("surfaceCreatureCount", -1.0);
        double caveCreatureCount = values.getOrDefault("caveCreatureCount", -1.0);
        double creatureCount = values.getOrDefault("creatureCount", -1.0);
        if (creatureCount < 0.0 && (surfaceCreatureCount >= 0.0 || caveCreatureCount >= 0.0)) {
            creatureCount = Math.max(0.0, surfaceCreatureCount) + Math.max(0.0, caveCreatureCount);
            values.put("creatureCount", creatureCount);
        } else if (creatureCount < 0.0) {
            creatureCount = 0.0;
            values.put("creatureCount", creatureCount);
        }
        if (surfaceCreatureCount < 0.0 && caveCreatureCount >= 0.0) {
            values.put("surfaceCreatureCount", Math.max(0.0, creatureCount - caveCreatureCount));
        } else if (surfaceCreatureCount < 0.0) {
            values.put("surfaceCreatureCount", creatureCount);
        }
        if (caveCreatureCount < 0.0) {
            values.put("caveCreatureCount", 0.0);
        }
        values.putIfAbsent("portalCount", 0.0);
        values.putIfAbsent("reachableAreaRatio", doubleAt(stats, "reachableAreaRatio", 0.0));

        double npcCount = values.getOrDefault("npcCount", 0.0);
        values.putIfAbsent("creatureDensity", creatureCount / area);
        values.putIfAbsent("livingDensity", (creatureCount + npcCount) / area);
        return values;
    }

    private Map<String, Double> mapDna(JsonNode stats, Map<String, Double> livingStats, int width, int height) {
        Map<String, Double> values = new LinkedHashMap<>();
        values.put("width", normalize(width, MAX_MAP_SIZE));
        values.put("height", normalize(height, MAX_MAP_SIZE));
        values.put("waterRatio", doubleAt(stats, "waterRatio", 0.0));
        values.put("landRatio", doubleAt(stats, "landRatio", 0.0));
        values.put("forestRatio", doubleAt(stats, "forestRatio", 0.0));
        values.put("mountainRatio", doubleAt(stats, "mountainRatio", 0.0));
        values.put("caveAreaRatio", doubleAt(stats, "caveAreaRatio", 0.0));
        values.put("blockedRatio", doubleAt(stats, "blockedRatio", 0.0));
        values.put("reachableAreaRatio", doubleAt(stats, "reachableAreaRatio", 0.0));
        values.put("treeDensity", density(doubleAt(stats, "treeCount", 0.0), width, height));
        values.put("roadDensity", density(doubleAt(stats, "roadLength", 0.0), width, height));
        values.put("villageDensity", density(doubleAt(stats, "villageCount", 0.0), width, height));
        values.put("creatureDensity", livingStats.getOrDefault("creatureDensity", 0.0));
        values.put("livingDensity", livingStats.getOrDefault("livingDensity", 0.0));
        values.put("surfaceCreatureDensity", density(livingStats.getOrDefault("surfaceCreatureCount", 0.0), width, height));
        values.put("caveCreatureDensity", density(livingStats.getOrDefault("caveCreatureCount", 0.0), width, height));
        values.put("portalDensity", density(livingStats.getOrDefault("portalCount", 0.0), width, height));
        return values;
    }

    private String mapType(JsonNode stats) {
        double cave = doubleAt(stats, "caveAreaRatio", 0.0);
        double water = doubleAt(stats, "waterRatio", 0.0);
        double forest = doubleAt(stats, "forestRatio", 0.0);
        double mountain = doubleAt(stats, "mountainRatio", 0.0);
        if (cave >= 0.12) {
            return "cave";
        }
        if (water >= 0.45) {
            return "archipelago";
        }
        if (mountain >= 0.25) {
            return "mountain";
        }
        if (forest >= 0.35) {
            return "forest";
        }
        return "mixed";
    }

    private String livingActivity(Map<String, Double> livingStats) {
        double creatureCount = livingStats.getOrDefault("creatureCount", 0.0);
        double npcCount = livingStats.getOrDefault("npcCount", 0.0);
        double livingCount = creatureCount + npcCount;
        if (livingCount <= 0.0) {
            return "quiet";
        }
        if (livingCount >= 20.0) {
            return "dense";
        }
        return "inhabited";
    }

    private JsonNode readJson(String rawJson) {
        try {
            return objectMapper.readTree(rawJson);
        } catch (Exception exception) {
            throw new IllegalStateException("Stored map search JSON is invalid", exception);
        }
    }

    private String textAt(JsonNode node, String field, String fallback) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? fallback : value.asText(fallback);
    }

    private double doubleAt(JsonNode node, String field, double fallback) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || !value.isNumber() ? fallback : value.doubleValue();
    }

    private void copyNumeric(JsonNode source, Map<String, Double> target, String field) {
        JsonNode value = source.get(field);
        if (value != null && value.isNumber()) {
            target.putIfAbsent(field, Math.max(0.0, value.doubleValue()));
        }
    }

    private void copyIfPresent(Map<String, Double> target, Map<String, Double> source, String field) {
        Double value = source.get(field);
        if (value != null) {
            target.putIfAbsent(field, value);
        }
    }

    private double density(double count, int width, int height) {
        return count / Math.max(1.0, (double) width * height);
    }

    private double normalize(double value, double max) {
        return Math.max(0.0, Math.min(1.0, value / max));
    }

    private void afterCommit(Runnable task) {
        Runnable guarded = () -> {
            try {
                task.run();
            } catch (RuntimeException exception) {
                logger.warn("Map search projection update failed", exception);
            }
        };

        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            guarded.run();
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                guarded.run();
            }
        });
    }
}
