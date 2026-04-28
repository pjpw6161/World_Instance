package com.worldforge.api;

import com.worldforge.api.search.FacetBucketResponse;
import com.worldforge.api.search.MapSearchDocument;
import com.worldforge.api.search.MapSearchFacetsResponse;
import com.worldforge.api.search.MapSearchIndexClient;
import com.worldforge.api.search.MapSearchRequest;
import com.worldforge.api.search.MapSearchResponse;
import com.worldforge.api.search.MapSearchResultResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class E2eSmokeApiIntegrationTests {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RecordingSmokeSearchIndexClient searchIndexClient;

    @BeforeEach
    void clearSearchIndex() {
        searchIndexClient.clear();
    }

    @Test
    void verifiesAuthenticatedMapWorldAndSearchSmokeFlow() throws Exception {
        String email = "smoke-" + UUID.randomUUID() + "@example.com";
        JsonNode signedUp = postJson("/api/auth/signup", Map.of(
                        "email", email,
                        "password", "Password123!",
                        "nickname", "Smoke User"
                ))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.token").isString())
                .andReturnJson();
        assertThat(signedUp.get("user").get("email").asText()).isEqualTo(email);

        JsonNode loggedIn = postJson("/api/auth/login", Map.of(
                        "email", email,
                        "password", "Password123!"
                ))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value(email))
                .andReturnJson();
        String ownerToken = bearer(loggedIn);
        String otherToken = signUpUser("other-smoke-" + UUID.randomUUID() + "@example.com");

        mockMvc.perform(get("/api/me").header("Authorization", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email));

        String title = "Smoke E2E Map " + UUID.randomUUID();
        String mapHash = "smoke-hash-" + UUID.randomUUID();
        JsonNode createdMap = postJson("/api/maps", createMapPayload(title, 24680L, mapHash), ownerToken)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value(title))
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.currentVersion.mapHash").value(mapHash))
                .andReturnJson();
        UUID projectId = UUID.fromString(createdMap.get("id").asText());
        UUID versionId = UUID.fromString(createdMap.get("currentVersionId").asText());

        mockMvc.perform(get("/api/maps/{projectId}", projectId)
                        .header("Authorization", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(projectId.toString()))
                .andExpect(jsonPath("$.currentVersion.id").value(versionId.toString()))
                .andExpect(jsonPath("$.currentVersion.recipe.seed").value(24680));

        mockMvc.perform(get("/api/maps/{projectId}", projectId))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/maps/{projectId}", projectId)
                        .header("Authorization", otherToken))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/maps/{projectId}/versions", projectId)
                        .header("Authorization", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(versionId.toString()))
                .andExpect(jsonPath("$[0].mapHash").value(mapHash));

        mockMvc.perform(get("/api/map-versions/{versionId}", versionId)
                        .header("Authorization", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.mapHash").value(mapHash));

        mockMvc.perform(get("/api/search/maps").param("keyword", title))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));

        JsonNode createdWorld = postJson("/api/world-instances", Map.of(
                        "mapVersionId", versionId.toString(),
                        "name", "Smoke World",
                        "worldTime", 3,
                        "entities", List.of(entity("player", "player", 4, 4))
                ), ownerToken)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.worldInstance.name").value("Smoke World"))
                .andExpect(jsonPath("$.worldInstance.worldTime").value(3))
                .andExpect(jsonPath("$.entities[0].entityKey").value("player"))
                .andReturnJson();
        UUID worldInstanceId = UUID.fromString(createdWorld.get("worldInstance").get("id").asText());

        putJson("/api/world-instances/" + worldInstanceId + "/state", Map.of(
                        "worldTime", 9,
                        "entities", List.of(
                                entity("creature-1", "creature", 6, 4),
                                entity("player", "player", 5, 4)
                        )
                ), ownerToken)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.worldInstance.worldTime").value(9))
                .andExpect(jsonPath("$.entities.length()").value(2));

        mockMvc.perform(get("/api/world-instances/{worldInstanceId}/state", worldInstanceId)
                        .header("Authorization", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.worldInstance.mapVersionId").value(versionId.toString()))
                .andExpect(jsonPath("$.worldInstance.worldTime").value(9))
                .andExpect(jsonPath("$.entities[0].entityKey").value("creature-1"))
                .andExpect(jsonPath("$.entities[0].x").value(6))
                .andExpect(jsonPath("$.entities[1].entityKey").value("player"))
                .andExpect(jsonPath("$.entities[1].x").value(5));

        mockMvc.perform(get("/api/world-instances/{worldInstanceId}/state", worldInstanceId)
                        .header("Authorization", otherToken))
                .andExpect(status().isNotFound());

        patchJson("/api/maps/" + projectId, Map.of("visibility", "PUBLIC"), ownerToken)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PUBLIC"));

        mockMvc.perform(get("/api/maps/{projectId}", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PUBLIC"))
                .andExpect(jsonPath("$.currentVersion.mapHash").value(mapHash));

        mockMvc.perform(get("/api/search/maps").param("keyword", title))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.results[0].projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.results[0].mapHash").value(mapHash));
    }

    private String signUpUser(String email) throws Exception {
        JsonNode signedUp = postJson("/api/auth/signup", Map.of(
                        "email", email,
                        "password", "Password123!",
                        "nickname", "Other Smoke User"
                ))
                .andExpect(status().isCreated())
                .andReturnJson();
        return bearer(signedUp);
    }

    private String bearer(JsonNode authResponse) {
        return "Bearer " + authResponse.get("token").asText();
    }

    private ResultWithJson postJson(String path, Object payload) throws Exception {
        return new ResultWithJson(mockMvc.perform(post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))));
    }

    private ResultWithJson postJson(String path, Object payload, String token) throws Exception {
        return new ResultWithJson(mockMvc.perform(post(path)
                .header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))));
    }

    private ResultWithJson putJson(String path, Object payload, String token) throws Exception {
        return new ResultWithJson(mockMvc.perform(put(path)
                .header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))));
    }

    private ResultWithJson patchJson(String path, Object payload, String token) throws Exception {
        return new ResultWithJson(mockMvc.perform(patch(path)
                .header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))));
    }

    private Map<String, Object> createMapPayload(String title, long seed, String mapHash) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", title);
        payload.put("description", "API smoke test map");
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
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("waterRatio", 0.25);
        stats.put("landRatio", 0.75);
        stats.put("forestRatio", 0.24);
        stats.put("mountainRatio", 0.1);
        stats.put("treeCount", 10);
        stats.put("roadLength", 4);
        stats.put("caveAreaRatio", 0.0);
        stats.put("villageCount", 1);
        stats.put("creatureCount", 4);
        stats.put("surfaceCreatureCount", 3);
        stats.put("caveCreatureCount", 1);
        stats.put("portalCount", 1);
        stats.put("reachableAreaRatio", 0.76);
        stats.put("livingStats", Map.of(
                "creatureCount", 4,
                "surfaceCreatureCount", 3,
                "caveCreatureCount", 1,
                "reachableAreaRatio", 0.76,
                "blockedTileRatio", 0.15,
                "portalCount", 1,
                "npcCount", 1,
                "livingDensity", 0.00008,
                "creatureDensity", 0.00006
        ));
        stats.put("blockedRatio", 0.15);
        stats.put("generationTimeMs", 1);
        return stats;
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
        entity.put("movementCostMultiplier", type.equals("player") ? 1.0 : 1.4);
        entity.put("jumpHeight", type.equals("player") ? 1.0 : 0.25);
        entity.put("maxSlope", type.equals("player") ? 0.35 : 0.2);
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

    @TestConfiguration
    static class SmokeSearchTestConfig {
        @Bean
        @Primary
        RecordingSmokeSearchIndexClient recordingSmokeSearchIndexClient() {
            return new RecordingSmokeSearchIndexClient();
        }
    }

    static class RecordingSmokeSearchIndexClient implements MapSearchIndexClient {
        private final Map<UUID, MapSearchDocument> documents = new ConcurrentHashMap<>();

        @Override
        public void index(MapSearchDocument document) {
            documents.put(document.projectId(), document);
        }

        @Override
        public void delete(UUID projectId) {
            documents.remove(projectId);
        }

        @Override
        public void replaceAll(List<MapSearchDocument> documents) {
            this.documents.clear();
            for (MapSearchDocument document : documents) {
                this.documents.put(document.projectId(), document);
            }
        }

        @Override
        public MapSearchResponse search(MapSearchRequest request) {
            List<MapSearchResultResponse> results = documents.values()
                    .stream()
                    .filter(document -> matchesKeyword(document, request.keyword()))
                    .sorted(Comparator.comparing(MapSearchDocument::updatedAt).reversed())
                    .map(MapSearchResultResponse::fromDocument)
                    .toList();
            return new MapSearchResponse(results, results.size(), request.page(), request.size());
        }

        @Override
        public MapSearchResponse similar(UUID projectId, int size) {
            return new MapSearchResponse(List.of(), 0, 0, size);
        }

        @Override
        public MapSearchFacetsResponse facets() {
            return new MapSearchFacetsResponse(
                    buckets(documents.values().stream().map(MapSearchDocument::mapType).toList()),
                    buckets(documents.values().stream().flatMap(document -> document.features().stream()).toList()),
                    buckets(documents.values().stream().map(MapSearchDocument::terrainAlgorithm).toList()),
                    buckets(documents.values().stream().map(MapSearchDocument::caveAlgorithm).toList()),
                    buckets(documents.values().stream().map(MapSearchDocument::roadAlgorithm).toList()),
                    buckets(documents.values().stream().map(MapSearchDocument::objectPlacementAlgorithm).toList()),
                    buckets(documents.values().stream().map(MapSearchDocument::livingActivity).toList()),
                    List.of(),
                    List.of(),
                    List.of(),
                    List.of(),
                    List.of(),
                    List.of()
            );
        }

        void clear() {
            documents.clear();
        }

        private boolean matchesKeyword(MapSearchDocument document, String keyword) {
            if (keyword == null || keyword.isBlank()) {
                return true;
            }
            String normalized = keyword.toLowerCase();
            return document.title().toLowerCase().contains(normalized)
                    || document.description().toLowerCase().contains(normalized)
                    || document.mapHash().toLowerCase().contains(normalized);
        }

        private List<FacetBucketResponse> buckets(List<String> values) {
            return values.stream()
                    .collect(Collectors.groupingBy(value -> value, Collectors.counting()))
                    .entrySet()
                    .stream()
                    .sorted(Map.Entry.<String, Long>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                    .map(entry -> new FacetBucketResponse(entry.getKey(), entry.getValue()))
                    .collect(Collectors.toCollection(ArrayList::new));
        }
    }
}
