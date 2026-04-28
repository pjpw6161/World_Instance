package com.worldforge.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record SaveWorldStateRequest(
        @NotNull
        @Min(0)
        Long worldTime,

        @NotNull
        @Valid
        List<SaveEntityStateRequest> entities
) {
}
