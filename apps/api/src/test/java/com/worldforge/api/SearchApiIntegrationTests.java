package com.worldforge.api;

import com.worldforge.api.common.ApiException;
import com.worldforge.api.search.FacetBucketResponse;
import com.worldforge.api.search.MapSearchDocument;
import com.worldforge.api.search.MapSearchFacetsResponse;
import com.worldforge.api.search.MapSearchIndexClient;
import com.worldforge.api.search.MapSearchRequest;
import com.worldforge.api.search.MapSearchResponse;
import com.worldforge.api.search.MapSearchResultResponse;
import com.worldforge.api.search.NumericRange;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "world-forge.admin.enabled=true")
@AutoConfigureMockMvc
class SearchApiIntegrationTests {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RecordingMapSearchIndexClient searchIndexClient;

    @BeforeEach
    void clearIndex() {
        searchIndexClient.clear();
    }

    @Test
    void indexesOnlyPublicMapsAndSupportsSafeFilters() throws Exception {
        JsonNode created = postJson("/api/maps", createMapPayload("Forest Road Island", 12345, "search-hash-a", 0.22))
                .andExpect(status().isCreated())
                .andReturnJson();
        UUID projectId = UUID.fromString(created.get("id").asText());

        mockMvc.perform(get("/api/search/maps")
                        .param("keyword", "Forest")
                        .param("features", "forests,roads")
                        .param("terrainAlgorithm", "noise-island")
                        .param("minWidth", "128")
                        .param("maxWidth", "512")
                        .param("minForestRatio", "0.2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));

        patchJson("/api/maps/" + projectId, Map.of("visibility", "PUBLIC"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PUBLIC"));

        mockMvc.perform(get("/api/search/maps")
                        .param("keyword", "Forest")
                        .param("features", "forests,roads")
                        .param("terrainAlgorithm", "noise-island")
                        .param("minWidth", "128")
                        .param("maxWidth", "512")
                        .param("minForestRatio", "0.2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.results[0].projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.results[0].features[0]").value("forests"));

        mockMvc.perform(get("/api/search/maps")
                        .param("features", "caves"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));

        patchJson("/api/maps/" + projectId, Map.of("visibility", "PRIVATE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PRIVATE"));

        mockMvc.perform(get("/api/search/maps").param("keyword", "Forest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void returnsSearchFacetsAndRejectsRawQueryParams() throws Exception {
        JsonNode first = postJson("/api/maps", createMapPayload("Mountain Public", 22222, "search-hash-b", 0.18))
                .andExpect(status().isCreated())
                .andReturnJson();
        JsonNode second = postJson("/api/maps", createMapPayload("Forest Public", 33333, "search-hash-c", 0.42))
                .andExpect(status().isCreated())
                .andReturnJson();

        patchJson("/api/maps/" + first.get("id").asText(), Map.of("visibility", "PUBLIC"))
                .andExpect(status().isOk());
        patchJson("/api/maps/" + second.get("id").asText(), Map.of("visibility", "PUBLIC"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/search/maps/facets"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.features[0].value").value("forests"))
                .andExpect(jsonPath("$.terrainAlgorithms[0].value").value("noise-island"));

        mockMvc.perform(get("/api/search/maps").param("query", "{\"match_all\":{}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SEARCH_REQUEST"))
                .andExpect(jsonPath("$.details[0]").value("query is not a supported search parameter"));
    }

    @Test
    void supportsLivingStatsFiltersAndSimilarMaps() throws Exception {
        JsonNode source = postJson("/api/maps", createMapPayload("Living Forest Alpha", 60001, "search-hash-living-a", 0.44, 12, 0.84, 2))
                .andExpect(status().isCreated())
                .andReturnJson();
        JsonNode neighbor = postJson("/api/maps", createMapPayload("Living Forest Beta", 60002, "search-hash-living-b", 0.43, 13, 0.82, 1))
                .andExpect(status().isCreated())
                .andReturnJson();
        JsonNode distant = postJson("/api/maps", createMapPayload("Quiet Mountain Delta", 60003, "search-hash-living-c", 0.05, 0, 0.35, 0))
                .andExpect(status().isCreated())
                .andReturnJson();
        UUID sourceProjectId = UUID.fromString(source.get("id").asText());
        UUID neighborProjectId = UUID.fromString(neighbor.get("id").asText());

        patchJson("/api/maps/" + source.get("id").asText(), Map.of("visibility", "PUBLIC"))
                .andExpect(status().isOk());
        patchJson("/api/maps/" + neighbor.get("id").asText(), Map.of("visibility", "PUBLIC"))
                .andExpect(status().isOk());
        patchJson("/api/maps/" + distant.get("id").asText(), Map.of("visibility", "PUBLIC"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/search/maps")
                        .param("livingActivity", "inhabited")
                        .param("minCreatureCount", "10")
                        .param("minReachableAreaRatio", "0.8")
                        .param("minLivingDensity", "0.0001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.results[0].livingActivity").value("inhabited"))
                .andExpect(jsonPath("$.results[0].livingStats.creatureCount").isNumber());

        mockMvc.perform(get("/api/search/maps/facets"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.livingActivities[0].value").value("inhabited"));

        mockMvc.perform(get("/api/search/maps/" + sourceProjectId + "/similar").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].projectId").value(neighborProjectId.toString()))
                .andExpect(jsonPath("$.results[0].similarityScore").isNumber());

        mockMvc.perform(get("/api/search/maps/" + sourceProjectId + "/similar").param("query", "{\"match_all\":{}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SIMILAR_MAPS_REQUEST"));
    }

    @Test
    void reindexesPublicMapsFromPostgresAndDropsStalePrivateDocuments() throws Exception {
        JsonNode publicMap = postJson("/api/maps", createMapPayload("Public Reindex Map", 44444, "search-hash-d", 0.24))
                .andExpect(status().isCreated())
                .andReturnJson();
        JsonNode privateMap = postJson("/api/maps", createMapPayload("Private Reindex Map", 55555, "search-hash-e", 0.24))
                .andExpect(status().isCreated())
                .andReturnJson();
        UUID publicProjectId = UUID.fromString(publicMap.get("id").asText());
        UUID privateProjectId = UUID.fromString(privateMap.get("id").asText());

        patchJson("/api/maps/" + publicProjectId, Map.of("visibility", "PUBLIC"))
                .andExpect(status().isOk());

        searchIndexClient.clear();
        searchIndexClient.index(staleDocument(privateProjectId));

        mockMvc.perform(post("/api/admin/search/maps/reindex"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.indexName").value("world_forge_maps"))
                .andExpect(jsonPath("$.publicProjects").isNumber())
                .andExpect(jsonPath("$.indexedDocuments").isNumber())
                .andExpect(jsonPath("$.skippedProjects").isNumber());

        mockMvc.perform(get("/api/search/maps").param("keyword", "Public Reindex"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.results[0].projectId").value(publicProjectId.toString()));

        mockMvc.perform(get("/api/search/maps").param("keyword", "Private Reindex"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void keepsMapPublicWhenPrivateProjectionDeleteFails() throws Exception {
        JsonNode created = postJson("/api/maps", createMapPayload("Delete Failure Public Map", 77777, "search-hash-delete-failure", 0.24))
                .andExpect(status().isCreated())
                .andReturnJson();
        UUID projectId = UUID.fromString(created.get("id").asText());

        patchJson("/api/maps/" + projectId, Map.of("visibility", "PUBLIC"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PUBLIC"));

        searchIndexClient.failDeleteFor(projectId);

        patchJson("/api/maps/" + projectId, Map.of("visibility", "PRIVATE"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("SEARCH_REQUEST_FAILED"));

        mockMvc.perform(get("/api/maps/" + projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PUBLIC"));

        mockMvc.perform(get("/api/search/maps").param("keyword", "Delete Failure"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1));
    }

    private ResultWithJson postJson(String path, Object payload) throws Exception {
        return new ResultWithJson(mockMvc.perform(post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))));
    }

    private ResultWithJson patchJson(String path, Object payload) throws Exception {
        return new ResultWithJson(mockMvc.perform(patch(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))));
    }

    private Map<String, Object> createMapPayload(String title, long seed, String mapHash, double forestRatio) {
        return createMapPayload(title, seed, mapHash, forestRatio, 4, 0.75, 1);
    }

    private Map<String, Object> createMapPayload(
            String title,
            long seed,
            String mapHash,
            double forestRatio,
            int creatureCount,
            double reachableAreaRatio,
            int npcCount
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", title);
        payload.put("description", "Searchable public map fixture");
        payload.put("recipe", recipe(seed));
        payload.put("stats", stats(forestRatio, creatureCount, reachableAreaRatio, npcCount));
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

    private Map<String, Object> stats(double forestRatio, int creatureCount, double reachableAreaRatio, int npcCount) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("waterRatio", 0.25);
        stats.put("landRatio", 0.75);
        stats.put("forestRatio", forestRatio);
        stats.put("mountainRatio", 0.1);
        stats.put("treeCount", 10);
        stats.put("roadLength", 4);
        stats.put("caveAreaRatio", 0.0);
        stats.put("villageCount", 1);
        stats.put("creatureCount", creatureCount);
        stats.put("livingStats", Map.of(
                "creatureCount", creatureCount,
                "npcCount", npcCount,
                "livingDensity", (creatureCount + npcCount) / 65_536.0,
                "creatureDensity", creatureCount / 65_536.0
        ));
        stats.put("blockedRatio", 0.15);
        stats.put("reachableAreaRatio", reachableAreaRatio);
        stats.put("generationTimeMs", 1);
        return stats;
    }

    private MapSearchDocument staleDocument(UUID projectId) {
        return new MapSearchDocument(
                projectId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Private Reindex Map",
                "Stale private projection that must be removed",
                "mixed",
                "stale-private-hash",
                "0.1.0",
                1,
                256,
                256,
                List.of("forests"),
                "noise-island",
                "cellular-automata",
                "astar",
                "biome-density",
                "inhabited",
                Map.of("forestRatio", 0.24, "creatureCount", 3.0),
                Map.of("creatureCount", 3.0, "livingDensity", 0.00005),
                Map.of("forestRatio", 0.24, "livingDensity", 0.00005),
                Instant.now(),
                Instant.now()
        );
    }

    @TestConfiguration
    static class SearchTestConfig {
        @Bean
        @Primary
        RecordingMapSearchIndexClient recordingMapSearchIndexClient() {
            return new RecordingMapSearchIndexClient();
        }
    }

    static class RecordingMapSearchIndexClient implements MapSearchIndexClient {
        private final Map<UUID, MapSearchDocument> documents = new ConcurrentHashMap<>();
        private final Set<UUID> deleteFailures = ConcurrentHashMap.newKeySet();

        @Override
        public void index(MapSearchDocument document) {
            documents.put(document.projectId(), document);
        }

        @Override
        public void delete(UUID projectId) {
            if (deleteFailures.contains(projectId)) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "SEARCH_REQUEST_FAILED", "Elasticsearch request failed");
            }
            documents.remove(projectId);
        }

        @Override
        public void replaceAll(List<MapSearchDocument> nextDocuments) {
            documents.clear();
            for (MapSearchDocument document : nextDocuments) {
                documents.put(document.projectId(), document);
            }
        }

        @Override
        public MapSearchResponse search(MapSearchRequest request) {
            List<MapSearchResultResponse> results = documents.values()
                    .stream()
                    .filter(document -> matches(document, request))
                    .sorted(Comparator.comparing(MapSearchDocument::updatedAt).reversed())
                    .map(MapSearchResultResponse::fromDocument)
                    .toList();
            int from = Math.min(results.size(), request.page() * request.size());
            int to = Math.min(results.size(), from + request.size());
            return new MapSearchResponse(results.subList(from, to), results.size(), request.page(), request.size());
        }

        @Override
        public MapSearchResponse similar(UUID projectId, int size) {
            MapSearchDocument target = documents.get(projectId);
            if (target == null || target.mapDna().isEmpty()) {
                return new MapSearchResponse(List.of(), 0, 0, size);
            }
            List<MapSearchResultResponse> results = documents.values()
                    .stream()
                    .filter(document -> !document.projectId().equals(projectId))
                    .map(document -> Map.entry(document, similarityScore(target, document)))
                    .sorted(Map.Entry.<MapSearchDocument, Double>comparingByValue().reversed()
                            .thenComparing(entry -> entry.getKey().updatedAt(), Comparator.reverseOrder()))
                    .limit(size)
                    .map(entry -> MapSearchResultResponse.fromDocument(entry.getKey(), entry.getValue()))
                    .toList();
            return new MapSearchResponse(results, Math.max(0, documents.size() - 1), 0, size);
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
                    buckets(documents.values().stream().map(MapSearchDocument::livingActivity).toList())
            );
        }

        void clear() {
            documents.clear();
            deleteFailures.clear();
        }

        void failDeleteFor(UUID projectId) {
            deleteFailures.add(projectId);
        }

        private boolean matches(MapSearchDocument document, MapSearchRequest request) {
            if (request.keyword() != null && !containsKeyword(document, request.keyword())) {
                return false;
            }
            if (request.mapType() != null && !request.mapType().equals(document.mapType())) {
                return false;
            }
            if (!document.features().containsAll(request.features())) {
                return false;
            }
            if (!matchesValue(request.terrainAlgorithm(), document.terrainAlgorithm())) {
                return false;
            }
            if (!matchesValue(request.caveAlgorithm(), document.caveAlgorithm())) {
                return false;
            }
            if (!matchesValue(request.roadAlgorithm(), document.roadAlgorithm())) {
                return false;
            }
            if (!matchesValue(request.objectPlacementAlgorithm(), document.objectPlacementAlgorithm())) {
                return false;
            }
            if (!matchesValue(request.livingActivity(), document.livingActivity())) {
                return false;
            }
            if (!inRange(document.width(), request.minWidth(), request.maxWidth())) {
                return false;
            }
            if (!inRange(document.height(), request.minHeight(), request.maxHeight())) {
                return false;
            }
            for (Map.Entry<String, NumericRange> entry : request.stats().entrySet()) {
                if (!inRange(document.stats().getOrDefault(entry.getKey(), 0.0), entry.getValue().min(), entry.getValue().max())) {
                    return false;
                }
            }
            for (Map.Entry<String, NumericRange> entry : request.livingStats().entrySet()) {
                if (!inRange(document.livingStats().getOrDefault(entry.getKey(), 0.0), entry.getValue().min(), entry.getValue().max())) {
                    return false;
                }
            }
            return true;
        }

        private double similarityScore(MapSearchDocument target, MapSearchDocument candidate) {
            double distance = 0.0;
            for (Map.Entry<String, Double> entry : target.mapDna().entrySet()) {
                Double candidateValue = candidate.mapDna().get(entry.getKey());
                if (candidateValue == null) {
                    continue;
                }
                double diff = candidateValue - entry.getValue();
                distance += diff * diff;
            }
            return 1.0 / (1.0 + distance);
        }

        private boolean containsKeyword(MapSearchDocument document, String keyword) {
            String normalized = keyword.toLowerCase();
            return document.title().toLowerCase().contains(normalized)
                    || document.description().toLowerCase().contains(normalized)
                    || document.mapHash().toLowerCase().contains(normalized);
        }

        private boolean matchesValue(String requested, String actual) {
            return requested == null || requested.equals(actual);
        }

        private boolean inRange(Number value, Number min, Number max) {
            double number = value.doubleValue();
            return (min == null || number >= min.doubleValue()) && (max == null || number <= max.doubleValue());
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
