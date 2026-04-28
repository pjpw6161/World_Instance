package com.worldforge.api.search;

import com.worldforge.api.common.ApiException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

public class HttpMapSearchIndexClient implements MapSearchIndexClient {
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
            "generationTimeMs"
    );

    private final ElasticsearchSettings settings;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final AtomicBoolean indexReady = new AtomicBoolean(false);

    public HttpMapSearchIndexClient(
            ElasticsearchSettings settings,
            HttpClient httpClient,
            ObjectMapper objectMapper
    ) {
        this.settings = settings;
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public void index(MapSearchDocument document) {
        ensureIndex();
        requestJson("PUT", "/" + settings.indexName() + "/_doc/" + encode(document.projectId().toString()), toSource(document));
    }

    @Override
    public void delete(UUID projectId) {
        ensureIndex();
        HttpResponse<String> response = request("DELETE", "/" + settings.indexName() + "/_doc/" + encode(projectId.toString()), null);
        if (response.statusCode() == 404) {
            return;
        }
        ensureSuccess(response);
    }

    @Override
    public MapSearchResponse search(MapSearchRequest request) {
        ensureIndex();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("from", Math.max(0, request.page()) * request.size());
        body.put("size", request.size());
        body.put("query", Map.of("bool", buildBoolQuery(request)));
        body.put("sort", List.of(Map.of("updatedAt", Map.of("order", "desc")), "_score"));

        JsonNode root = requestJson("POST", "/" + settings.indexName() + "/_search", body);
        JsonNode hitsNode = root.get("hits");
        long total = longAt(objectAt(hitsNode, "total"), "value", 0);
        List<MapSearchResultResponse> results = new ArrayList<>();
        JsonNode hits = objectAt(hitsNode, "hits");
        if (hits != null && hits.isArray()) {
            for (JsonNode hit : hits) {
                JsonNode source = hit.get("_source");
                if (source != null && source.isObject()) {
                    results.add(MapSearchResultResponse.fromDocument(fromSource(source)));
                }
            }
        }
        return new MapSearchResponse(results, total, request.page(), request.size());
    }

    @Override
    public MapSearchFacetsResponse facets() {
        ensureIndex();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("size", 0);
        body.put("aggs", Map.of(
                "mapTypes", termsAgg("mapType"),
                "features", termsAgg("features"),
                "terrainAlgorithms", termsAgg("terrainAlgorithm"),
                "caveAlgorithms", termsAgg("caveAlgorithm"),
                "roadAlgorithms", termsAgg("roadAlgorithm"),
                "objectPlacementAlgorithms", termsAgg("objectPlacementAlgorithm")
        ));

        JsonNode root = requestJson("POST", "/" + settings.indexName() + "/_search", body);
        JsonNode aggs = root.get("aggregations");
        return new MapSearchFacetsResponse(
                buckets(aggs, "mapTypes"),
                buckets(aggs, "features"),
                buckets(aggs, "terrainAlgorithms"),
                buckets(aggs, "caveAlgorithms"),
                buckets(aggs, "roadAlgorithms"),
                buckets(aggs, "objectPlacementAlgorithms")
        );
    }

    private void ensureIndex() {
        if (indexReady.get()) {
            return;
        }

        Map<String, Object> body = Map.of(
                "mappings", Map.of(
                        "properties", indexProperties()
                )
        );
        HttpResponse<String> response = request("PUT", "/" + settings.indexName(), body);
        if (response.statusCode() == 400 && response.body().contains("resource_already_exists_exception")) {
            indexReady.set(true);
            return;
        }
        ensureSuccess(response);
        indexReady.set(true);
    }

    private Map<String, Object> indexProperties() {
        Map<String, Object> statsProperties = new LinkedHashMap<>();
        for (String field : STAT_FIELDS) {
            statsProperties.put(field, Map.of("type", "double"));
        }

        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("projectId", Map.of("type", "keyword"));
        properties.put("versionId", Map.of("type", "keyword"));
        properties.put("ownerId", Map.of("type", "keyword"));
        properties.put("title", Map.of("type", "text", "fields", Map.of("keyword", Map.of("type", "keyword"))));
        properties.put("description", Map.of("type", "text"));
        properties.put("mapType", Map.of("type", "keyword"));
        properties.put("mapHash", Map.of("type", "keyword"));
        properties.put("engineVersion", Map.of("type", "keyword"));
        properties.put("seed", Map.of("type", "long"));
        properties.put("width", Map.of("type", "integer"));
        properties.put("height", Map.of("type", "integer"));
        properties.put("features", Map.of("type", "keyword"));
        properties.put("terrainAlgorithm", Map.of("type", "keyword"));
        properties.put("caveAlgorithm", Map.of("type", "keyword"));
        properties.put("roadAlgorithm", Map.of("type", "keyword"));
        properties.put("objectPlacementAlgorithm", Map.of("type", "keyword"));
        properties.put("stats", Map.of("properties", statsProperties));
        properties.put("createdAt", Map.of("type", "date"));
        properties.put("updatedAt", Map.of("type", "date"));
        return properties;
    }

    private Map<String, Object> buildBoolQuery(MapSearchRequest request) {
        List<Object> must = new ArrayList<>();
        List<Object> filter = new ArrayList<>();

        if (request.keyword() != null && !request.keyword().isBlank()) {
            must.add(Map.of("multi_match", Map.of(
                    "query", request.keyword().trim(),
                    "fields", List.of("title^2", "description", "mapHash")
            )));
        }
        term(filter, "mapType", request.mapType());
        term(filter, "terrainAlgorithm", request.terrainAlgorithm());
        term(filter, "caveAlgorithm", request.caveAlgorithm());
        term(filter, "roadAlgorithm", request.roadAlgorithm());
        term(filter, "objectPlacementAlgorithm", request.objectPlacementAlgorithm());
        for (String feature : request.features()) {
            term(filter, "features", feature);
        }
        range(filter, "width", request.minWidth(), request.maxWidth());
        range(filter, "height", request.minHeight(), request.maxHeight());
        for (Map.Entry<String, NumericRange> entry : request.stats().entrySet()) {
            range(filter, "stats." + entry.getKey(), entry.getValue().min(), entry.getValue().max());
        }

        Map<String, Object> bool = new LinkedHashMap<>();
        if (!must.isEmpty()) {
            bool.put("must", must);
        }
        if (!filter.isEmpty()) {
            bool.put("filter", filter);
        }
        if (must.isEmpty() && filter.isEmpty()) {
            bool.put("must", List.of(Map.of("match_all", Map.of())));
        }
        return bool;
    }

    private void term(List<Object> filter, String field, String value) {
        if (value != null && !value.isBlank()) {
            filter.add(Map.of("term", Map.of(field, value.trim())));
        }
    }

    private void range(List<Object> filter, String field, Number min, Number max) {
        if (min == null && max == null) {
            return;
        }
        Map<String, Object> limits = new LinkedHashMap<>();
        if (min != null) {
            limits.put("gte", min);
        }
        if (max != null) {
            limits.put("lte", max);
        }
        filter.add(Map.of("range", Map.of(field, limits)));
    }

    private Map<String, Object> termsAgg(String field) {
        return Map.of("terms", Map.of("field", field, "size", 20));
    }

    private List<FacetBucketResponse> buckets(JsonNode aggregations, String aggregationName) {
        JsonNode aggregation = objectAt(aggregations, aggregationName);
        JsonNode buckets = objectAt(aggregation, "buckets");
        if (buckets == null || !buckets.isArray()) {
            return List.of();
        }
        List<FacetBucketResponse> responses = new ArrayList<>();
        for (JsonNode bucket : buckets) {
            responses.add(new FacetBucketResponse(textAt(bucket, "key", ""), longAt(bucket, "doc_count", 0)));
        }
        return responses;
    }

    private Map<String, Object> toSource(MapSearchDocument document) {
        Map<String, Object> source = new LinkedHashMap<>();
        source.put("projectId", document.projectId().toString());
        source.put("versionId", document.versionId().toString());
        source.put("ownerId", document.ownerId().toString());
        source.put("title", document.title());
        source.put("description", document.description());
        source.put("mapType", document.mapType());
        source.put("mapHash", document.mapHash());
        source.put("engineVersion", document.engineVersion());
        source.put("seed", document.seed());
        source.put("width", document.width());
        source.put("height", document.height());
        source.put("features", document.features());
        source.put("terrainAlgorithm", document.terrainAlgorithm());
        source.put("caveAlgorithm", document.caveAlgorithm());
        source.put("roadAlgorithm", document.roadAlgorithm());
        source.put("objectPlacementAlgorithm", document.objectPlacementAlgorithm());
        source.put("stats", document.stats());
        source.put("createdAt", document.createdAt().toString());
        source.put("updatedAt", document.updatedAt().toString());
        return source;
    }

    private MapSearchDocument fromSource(JsonNode source) {
        return new MapSearchDocument(
                UUID.fromString(textAt(source, "projectId", "")),
                UUID.fromString(textAt(source, "versionId", "")),
                UUID.fromString(textAt(source, "ownerId", "")),
                textAt(source, "title", ""),
                textAt(source, "description", ""),
                textAt(source, "mapType", "mixed"),
                textAt(source, "mapHash", ""),
                textAt(source, "engineVersion", ""),
                longAt(source, "seed", 0),
                intAt(source, "width", 0),
                intAt(source, "height", 0),
                stringListAt(source, "features"),
                textAt(source, "terrainAlgorithm", ""),
                textAt(source, "caveAlgorithm", ""),
                textAt(source, "roadAlgorithm", ""),
                textAt(source, "objectPlacementAlgorithm", ""),
                statsAt(source),
                java.time.Instant.parse(textAt(source, "createdAt", "1970-01-01T00:00:00Z")),
                java.time.Instant.parse(textAt(source, "updatedAt", "1970-01-01T00:00:00Z"))
        );
    }

    private Map<String, Double> statsAt(JsonNode source) {
        Map<String, Double> stats = new LinkedHashMap<>();
        JsonNode statsNode = source.get("stats");
        if (statsNode == null || !statsNode.isObject()) {
            return stats;
        }
        for (String field : statsNode.propertyNames()) {
            JsonNode value = statsNode.get(field);
            if (value != null && value.isNumber()) {
                stats.put(field, value.doubleValue());
            }
        }
        return stats;
    }

    private List<String> stringListAt(JsonNode source, String field) {
        JsonNode node = source.get(field);
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            values.add(item.asText());
        }
        return values;
    }

    private JsonNode requestJson(String method, String path, Object body) {
        HttpResponse<String> response = request(method, path, body);
        ensureSuccess(response);
        try {
            return objectMapper.readTree(response.body());
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "SEARCH_RESPONSE_INVALID", "Elasticsearch response was invalid JSON");
        }
    }

    private HttpResponse<String> request(String method, String path, Object body) {
        try {
            HttpRequest.BodyPublisher publisher = body == null
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body));
            HttpRequest request = HttpRequest.newBuilder(resolve(path))
                    .timeout(Duration.ofSeconds(10))
                    .method(method, publisher)
                    .header("Content-Type", "application/json")
                    .build();
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (ApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "SEARCH_UNAVAILABLE", "Elasticsearch is unavailable");
        }
    }

    private URI resolve(String path) {
        String base = settings.url().toString();
        String normalizedBase = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        return URI.create(normalizedBase + path);
    }

    private void ensureSuccess(HttpResponse<String> response) {
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "SEARCH_REQUEST_FAILED", "Elasticsearch request failed");
        }
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private JsonNode objectAt(JsonNode node, String field) {
        return node == null ? null : node.get(field);
    }

    private String textAt(JsonNode node, String field, String fallback) {
        JsonNode value = objectAt(node, field);
        return value == null || value.isNull() ? fallback : value.asText(fallback);
    }

    private int intAt(JsonNode node, String field, int fallback) {
        JsonNode value = objectAt(node, field);
        return value == null || !value.isNumber() ? fallback : value.intValue();
    }

    private long longAt(JsonNode node, String field, long fallback) {
        JsonNode value = objectAt(node, field);
        return value == null || !value.isNumber() ? fallback : value.longValue();
    }
}
