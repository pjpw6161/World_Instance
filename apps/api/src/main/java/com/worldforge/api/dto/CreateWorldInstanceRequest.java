package com.worldforge.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CreateWorldInstanceRequest(
        @NotNull
        UUID mapVersionId,

        @NotBlank
        @Size(max = 160)
        String name,

        @Min(0)
        Long worldTime,

        @Valid
        List<SaveEntityStateRequest> entities
) {
}
