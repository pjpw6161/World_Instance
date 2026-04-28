package com.worldforge.api.dto;

import tools.jackson.databind.JsonNode;

import java.util.UUID;

public record EntityStateResponse(
        UUID id,
        UUID worldInstanceId,
        String entityKey,
        String entityType,
        String layerId,
        int x,
        int y,
        Double z,
        Integer homeX,
        Integer homeY,
        Double movementCostMultiplier,
        Double jumpHeight,
        String state,
        String behavior,
        JsonNode metadataJson
) {
}
