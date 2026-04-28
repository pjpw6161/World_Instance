package com.worldforge.api.service;

import tools.jackson.databind.JsonNode;

public record RecipePayload(
        String engineVersion,
        long seed,
        int width,
        int height,
        JsonNode recipe,
        JsonNode stats,
        String mapHash,
        String thumbnailUrl
) {
}
