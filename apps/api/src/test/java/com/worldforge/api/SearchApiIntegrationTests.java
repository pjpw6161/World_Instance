package com.worldforge.api;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
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
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", title);
        payload.put("description", "Searchable public map fixture");
        payload.put("recipe", recipe(seed));
        payload.put("stats", stats(forestRatio));
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

    private Map<String, Object> stats(double forestRatio) {
        return Map.of(
                "waterRatio", 0.25,
                "landRatio", 0.75,
                "forestRatio", forestRatio,
                "mountainRatio", 0.1,
                "treeCount", 10,
                "roadLength", 4,
                "caveAreaRatio", 0.0,
                "villageCount", 1,
                "blockedRatio", 0.15,
                "generationTimeMs", 1
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

        @Override
        public void index(MapSearchDocument document) {
            documents.put(document.projectId(), document);
        }

        @Override
        public void delete(UUID projectId) {
            documents.remove(projectId);
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
        public MapSearchFacetsResponse facets() {
            return new MapSearchFacetsResponse(
                    buckets(documents.values().stream().map(MapSearchDocument::mapType).toList()),
                    buckets(documents.values().stream().flatMap(document -> document.features().stream()).toList()),
                    buckets(documents.values().stream().map(MapSearchDocument::terrainAlgorithm).toList()),
                    buckets(documents.values().stream().map(MapSearchDocument::caveAlgorithm).toList()),
                    buckets(documents.values().stream().map(MapSearchDocument::roadAlgorithm).toList()),
                    buckets(documents.values().stream().map(MapSearchDocument::objectPlacementAlgorithm).toList())
            );
        }

        void clear() {
            documents.clear();
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
            return true;
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
