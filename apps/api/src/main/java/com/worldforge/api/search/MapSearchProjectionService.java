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

    private MapSearchDocument toDocument(MapProject project, MapVersion version) {
        JsonNode recipe = readJson(version.getRecipeJson());
        JsonNode stats = readJson(version.getStatsJson());
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
                numericStats(stats),
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

    private Map<String, Double> numericStats(JsonNode stats) {
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
