package com.worldforge.api.dto;

import java.time.Instant;
import java.util.UUID;

public record WorldInstanceResponse(
        UUID id,
        UUID ownerId,
        UUID mapVersionId,
        String name,
        long worldTime,
        Instant createdAt,
        Instant lastSavedAt
) {
}
