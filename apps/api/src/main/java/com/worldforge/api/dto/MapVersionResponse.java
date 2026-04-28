package com.worldforge.api.dto;

import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

public record MapVersionResponse(
        UUID id,
        UUID projectId,
        String engineVersion,
        long seed,
        int width,
        int height,
        JsonNode recipe,
        JsonNode stats,
        String mapHash,
        String thumbnailUrl,
        Instant createdAt
) {
}
