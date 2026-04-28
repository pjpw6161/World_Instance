package com.worldforge.api.dto;

import com.worldforge.api.domain.MapVisibility;
import jakarta.validation.constraints.Size;

public record UpdateMapProjectRequest(
        @Size(max = 160)
        String title,

        @Size(max = 2000)
        String description,

        MapVisibility visibility
) {
}
