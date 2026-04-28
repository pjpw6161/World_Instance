package com.worldforge.api;

import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

final class AuthTestSupport {
    private static final String DEFAULT_PASSWORD = "Password123!";

    private AuthTestSupport() {
    }

    static String bearerToken(MockMvc mockMvc, ObjectMapper objectMapper) throws Exception {
        return bearerToken(mockMvc, objectMapper, "user-" + UUID.randomUUID() + "@example.com");
    }

    static String bearerToken(MockMvc mockMvc, ObjectMapper objectMapper, String email) throws Exception {
        String response = mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email,
                                "password", DEFAULT_PASSWORD,
                                "nickname", "Test User"
                        ))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode root = objectMapper.readTree(response);
        return "Bearer " + root.get("token").asText();
    }

    static String authorizationHeader(String bearerToken) {
        return bearerToken;
    }
}
