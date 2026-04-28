package com.worldforge.api.dto;

import com.worldforge.api.domain.MapVisibility;

import java.time.Instant;
import java.util.UUID;

public record MapProjectResponse(
        UUID id,
        UUID ownerId,
        String title,
        String description,
        MapVisibility visibility,
        UUID currentVersionId,
        MapVersionResponse currentVersion,
        Instant createdAt,
        Instant updatedAt
) {
}
