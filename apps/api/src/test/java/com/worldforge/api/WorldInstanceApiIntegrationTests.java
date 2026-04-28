package com.worldforge.api;

import com.worldforge.api.domain.EntityState;
import com.worldforge.api.domain.WorldInstance;
import com.worldforge.api.repository.EntityStateRepository;
import com.worldforge.api.repository.WorldInstanceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class WorldInstanceApiIntegrationTests {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WorldInstanceRepository worldInstanceRepository;

    @Autowired
    private EntityStateRepository entityStateRepository;

    @Test
    void createsLoadsAndSavesWorldState() throws Exception {
        UUID mapVersionId = createMapVersion("world-map-a", 12345);

        JsonNode created = postJson("/api/world-instances", Map.of(
                        "mapVersionId", mapVersionId.toString(),
                        "name", "Playable Island",
                        "worldTime", 7,
                        "entities", List.of(entity("player", "player", 1, 1))
                ))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.worldInstance.name").value("Playable Island"))
                .andExpect(jsonPath("$.worldInstance.worldTime").value(7))
                .andExpect(jsonPath("$.entities[0].entityKey").value("player"))
                .andReturnJson();

        UUID worldInstanceId = UUID.fromString(created.get("worldInstance").get("id").asText());

        mockMvc.perform(get("/api/world-instances/{worldInstanceId}/state", worldInstanceId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.worldInstance.mapVersionId").value(mapVersionId.toString()))
                .andExpect(jsonPath("$.entities[0].x").value(1));

        JsonNode saved = putJson("/api/world-instances/" + worldInstanceId + "/state", Map.of(
                        "worldTime", 12,
                        "entities", List.of(
                                entity("player", "player", 2, 1),
                                entity("creature-1", "creature", 3, 1)
                        )
                ))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.worldInstance.worldTime").value(12))
                .andReturnJson();

        assertThat(saved.get("entities").size()).isEqualTo(2);

        JsonNode worlds = getJson("/api/me/world-instances")
                .andExpect(status().isOk())
                .andReturnJson();
        boolean listed = false;
        for (JsonNode world : worlds) {
            listed = listed || world.get("id").asText().equals(worldInstanceId.toString());
        }
        assertThat(listed).isTrue();

        List<WorldInstance> worldInstances = worldInstanceRepository.findAll();
        List<EntityState> entityStates = entityStateRepository.findByWorldInstanceIdOrderByEntityKeyAsc(worldInstanceId);
        assertThat(worldInstances).anySatisfy(world -> assertThat(world.getId()).isEqualTo(worldInstanceId));
        assertThat(entityStates).hasSize(2);
    }

    @Test
    void rejectsEntityStateOutsideMapBounds() throws Exception {
        UUID mapVersionId = createMapVersion("world-map-b", 54321);
        JsonNode created = postJson("/api/world-instances", Map.of(
                        "mapVersionId", mapVersionId.toString(),
                        "name", "Bounds Test",
                        "worldTime", 0,
                        "entities", List.of()
                ))
                .andExpect(status().isCreated())
                .andReturnJson();

        UUID worldInstanceId = UUID.fromString(created.get("worldInstance").get("id").asText());

        putJson("/api/world-instances/" + worldInstanceId + "/state", Map.of(
                        "worldTime", 1,
                        "entities", List.of(entity("player", "player", 999, 1))
                ))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_WORLD_STATE"))
                .andExpect(jsonPath("$.details[0]").value("entities.player.x must be between 0 and 255"));
    }

    private UUID createMapVersion(String title, long seed) throws Exception {
        JsonNode created = postJson("/api/maps", createMapPayload(title, seed, title + "-hash"))
                .andExpect(status().isCreated())
                .andReturnJson();
        return UUID.fromString(created.get("currentVersionId").asText());
    }

    private ResultWithJson postJson(String path, Object payload) throws Exception {
        return new ResultWithJson(mockMvc.perform(post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))));
    }

    private ResultWithJson putJson(String path, Object payload) throws Exception {
        return new ResultWithJson(mockMvc.perform(put(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))));
    }

    private ResultWithJson getJson(String path) throws Exception {
        return new ResultWithJson(mockMvc.perform(get(path)));
    }

    private Map<String, Object> createMapPayload(String title, long seed, String mapHash) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", title);
        payload.put("description", "World Instance API test map");
        payload.put("recipe", recipe(seed));
        payload.put("stats", stats());
        payload.put("mapHash", mapHash);
        return payload;
    }

    private Map<String, Object> recipe(long seed) {
        Map<String, Object> recipe = new LinkedHashMap<>();
        recipe.put("engineVersion", "0.1.0");
        recipe.put("seed", seed);
        recipe.put("width", 256);
        recipe.put("height", 256);
        recipe.put("features", Map.of(
                "mountains", true,
                "forests", true,
                "trees", true,
                "roads", true,
                "caves", false,
                "rivers", false,
                "villages", true
        ));
        recipe.put("algorithms", Map.of(
                "terrain", "noise-island",
                "cave", "cellular-automata",
                "road", "astar",
                "objectPlacement", "biome-density"
        ));
        recipe.put("params", Map.of(
                "waterLevel", 0.38,
                "mountainLevel", 0.72,
                "forestDensity", 0.55,
                "caveDensity", 0.42,
                "roadComplexity", 0.4
        ));
        return recipe;
    }

    private Map<String, Object> stats() {
        return Map.of(
                "waterRatio", 0.25,
                "landRatio", 0.75,
                "forestRatio", 0.2,
                "mountainRatio", 0.1,
                "treeCount", 10,
                "roadLength", 4,
                "caveAreaRatio", 0.0,
                "villageCount", 1,
                "blockedRatio", 0.15,
                "generationTimeMs", 1
        );
    }

    private Map<String, Object> entity(String key, String type, int x, int y) {
        Map<String, Object> entity = new LinkedHashMap<>();
        entity.put("entityKey", key);
        entity.put("entityType", type);
        entity.put("layerId", "surface");
        entity.put("x", x);
        entity.put("y", y);
        entity.put("z", null);
        entity.put("homeX", null);
        entity.put("homeY", null);
        entity.put("state", "idle");
        entity.put("behavior", type.equals("player") ? "manual" : "wander");
        entity.put("metadataJson", Map.of());
        return entity;
    }

    private class ResultWithJson {
        private final org.springframework.test.web.servlet.ResultActions resultActions;

        ResultWithJson(org.springframework.test.web.servlet.ResultActions resultActions) {
            this.resultActions = resultActions;
        }

        ResultWithJson andExpect(org.springframework.test.web.servlet.ResultMatcher matcher) throws Exception {
            resultActions.andExpect(matcher);
            return this;
        }

        JsonNode andReturnJson() throws Exception {
            String content = resultActions.andReturn().getResponse().getContentAsString();
            return objectMapper.readTree(content);
        }
    }
}
