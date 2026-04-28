package com.worldforge.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.JsonNode;

public record CreateMapRequest(
        @NotBlank
        @Size(max = 160)
        String title,

        @Size(max = 2000)
        String description,

        @NotNull
        JsonNode recipe,

        @NotNull
        JsonNode stats,

        @NotBlank
        @Size(max = 128)
        String mapHash,

        @Size(max = 2048)
        String thumbnailUrl
) {
}
