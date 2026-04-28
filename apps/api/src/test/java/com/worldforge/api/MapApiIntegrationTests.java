package com.worldforge.api;

import com.worldforge.api.domain.MapProject;
import com.worldforge.api.domain.MapVersion;
import com.worldforge.api.repository.MapProjectRepository;
import com.worldforge.api.repository.MapVersionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class MapApiIntegrationTests {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MapProjectRepository mapProjectRepository;

    @Autowired
    private MapVersionRepository mapVersionRepository;

    @Test
    void healthEndpointReturnsOk() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.service").value("world-forge-api"));
    }

    @Test
    void createsLoadsAndVersionsMapProjects() throws Exception {
        String token = AuthTestSupport.bearerToken(mockMvc, objectMapper);

        JsonNode created = postJson("/api/maps", createMapPayload("First Island", 12345, "hash-a"), token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("First Island"))
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.currentVersion.mapHash").value("hash-a"))
                .andReturnJson();

        UUID projectId = UUID.fromString(created.get("id").asText());
        UUID firstVersionId = UUID.fromString(created.get("currentVersionId").asText());

        mockMvc.perform(get("/api/maps/{projectId}", projectId)
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(projectId.toString()))
                .andExpect(jsonPath("$.currentVersion.id").value(firstVersionId.toString()));

        mockMvc.perform(get("/api/me/maps")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(projectId.toString()));

        mockMvc.perform(patch("/api/maps/{projectId}", projectId)
                        .header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "Renamed Island",
                                "visibility", "PUBLIC"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Renamed Island"))
                .andExpect(jsonPath("$.visibility").value("PUBLIC"));

        mockMvc.perform(get("/api/maps/{projectId}", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PUBLIC"));

        JsonNode version = postJson("/api/maps/" + projectId + "/versions", createVersionPayload(54321, "hash-b"), token)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.projectId").value(projectId.toString()))
                .andExpect(jsonPath("$.mapHash").value("hash-b"))
                .andReturnJson();
        UUID secondVersionId = UUID.fromString(version.get("id").asText());

        mockMvc.perform(get("/api/maps/{projectId}/versions", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(secondVersionId.toString()));

        mockMvc.perform(get("/api/map-versions/{versionId}", secondVersionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.seed").value(54321))
                .andExpect(jsonPath("$.width").value(256));

        List<MapProject> projects = mapProjectRepository.findAll();
        List<MapVersion> versions = mapVersionRepository.findAll();
        assertThat(projects).anySatisfy(project -> {
            assertThat(project.getId()).isEqualTo(projectId);
            assertThat(project.getCurrentVersionId()).isEqualTo(secondVersionId);
        });
        assertThat(versions).anySatisfy(savedVersion -> assertThat(savedVersion.getId()).isEqualTo(firstVersionId));
        assertThat(versions).anySatisfy(savedVersion -> assertThat(savedVersion.getId()).isEqualTo(secondVersionId));
    }

    @Test
    void rejectsInvalidRecipePayload() throws Exception {
        String token = AuthTestSupport.bearerToken(mockMvc, objectMapper);
        Map<String, Object> payload = createMapPayload("Bad Map", 12345, "hash-bad");
        @SuppressWarnings("unchecked")
        Map<String, Object> recipe = (Map<String, Object>) payload.get("recipe");
        recipe.put("width", 1);

        postJson("/api/maps", payload, token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECIPE"))
                .andExpect(jsonPath("$.details[0]").value("recipe.width must be between 64 and 512"));
    }

    @Test
    void requiresAuthenticationToCreateMaps() throws Exception {
        postJson("/api/maps", createMapPayload("No Auth", 12345, "hash-no-auth"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void hidesPrivateMapsFromOtherUsersAndAnonymousRequests() throws Exception {
        String ownerToken = AuthTestSupport.bearerToken(mockMvc, objectMapper);
        String otherToken = AuthTestSupport.bearerToken(mockMvc, objectMapper);
        JsonNode created = postJson("/api/maps", createMapPayload("Private Island", 12345, "hash-private"), ownerToken)
                .andExpect(status().isCreated())
                .andReturnJson();
        UUID projectId = UUID.fromString(created.get("id").asText());
        UUID versionId = UUID.fromString(created.get("currentVersionId").asText());

        mockMvc.perform(get("/api/maps/{projectId}", projectId))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/maps/{projectId}", projectId)
                        .header("Authorization", otherToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/map-versions/{versionId}", versionId)
                        .header("Authorization", otherToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/maps/{projectId}", projectId)
                        .header("Authorization", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(projectId.toString()));
    }

    @Test
    void forksPublicMapsIntoCurrentUsersPrivateLibrary() throws Exception {
        String ownerToken = AuthTestSupport.bearerToken(mockMvc, objectMapper);
        String otherToken = AuthTestSupport.bearerToken(mockMvc, objectMapper);
        JsonNode created = postJson("/api/maps", createMapPayload("Public Source", 24680, "hash-public-source"), ownerToken)
                .andExpect(status().isCreated())
                .andReturnJson();
        UUID sourceProjectId = UUID.fromString(created.get("id").asText());
        UUID sourceVersionId = UUID.fromString(created.get("currentVersionId").asText());

        mockMvc.perform(patch("/api/maps/{projectId}", sourceProjectId)
                        .header("Authorization", ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("visibility", "PUBLIC"))))
                .andExpect(status().isOk());

        JsonNode forked = postJson("/api/maps/" + sourceProjectId + "/fork", Map.of(), otherToken)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Fork of Public Source"))
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.currentVersion.mapHash").value("hash-public-source"))
                .andReturnJson();

        UUID forkProjectId = UUID.fromString(forked.get("id").asText());
        UUID forkVersionId = UUID.fromString(forked.get("currentVersionId").asText());
        assertThat(forkProjectId).isNotEqualTo(sourceProjectId);
        assertThat(forkVersionId).isNotEqualTo(sourceVersionId);

        mockMvc.perform(get("/api/maps/{projectId}", forkProjectId)
                        .header("Authorization", ownerToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/maps/{projectId}", forkProjectId)
                        .header("Authorization", otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentVersion.seed").value(24680));
    }

    @Test
    void doesNotForkPrivateMapsForOtherUsers() throws Exception {
        String ownerToken = AuthTestSupport.bearerToken(mockMvc, objectMapper);
        String otherToken = AuthTestSupport.bearerToken(mockMvc, objectMapper);
        JsonNode created = postJson("/api/maps", createMapPayload("Private Source", 13579, "hash-private-source"), ownerToken)
                .andExpect(status().isCreated())
                .andReturnJson();

        postJson("/api/maps/" + created.get("id").asText() + "/fork", Map.of(), otherToken)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MAP_NOT_FOUND"));
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

    private Map<String, Object> createMapPayload(String title, long seed, String mapHash) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", title);
        payload.put("description", "Saved by API test");
        payload.put("recipe", recipe(seed));
        payload.put("stats", stats());
        payload.put("mapHash", mapHash);
        return payload;
    }

    private Map<String, Object> createVersionPayload(long seed, String mapHash) {
        Map<String, Object> payload = new LinkedHashMap<>();
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
