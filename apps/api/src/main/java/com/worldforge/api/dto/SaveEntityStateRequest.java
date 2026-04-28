package com.worldforge.api.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.JsonNode;

public record SaveEntityStateRequest(
        @NotBlank
        @Size(max = 80)
        String entityKey,

        @NotBlank
        @Size(max = 32)
        String entityType,

        @NotBlank
        @Size(max = 80)
        String layerId,

        @Min(0)
        int x,

        @Min(0)
        int y,

        Double z,

        @Min(0)
        Integer homeX,

        @Min(0)
        Integer homeY,

        @DecimalMin("0.0")
        Double movementCostMultiplier,

        @DecimalMin("0.0")
        Double jumpHeight,

        @NotBlank
        @Size(max = 80)
        String state,

        @NotBlank
        @Size(max = 80)
        String behavior,

        JsonNode metadataJson
) {
}
