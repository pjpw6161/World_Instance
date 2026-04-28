package com.worldforge.api.search;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record MapSearchDocument(
        UUID projectId,
        UUID versionId,
        UUID ownerId,
        String ownerNickname,
        String title,
        String description,
        String mapType,
        String mapHash,
        String thumbnailUrl,
        String engineVersion,
        long seed,
        int width,
        int height,
        List<String> features,
        String terrainAlgorithm,
        String caveAlgorithm,
        String roadAlgorithm,
        String objectPlacementAlgorithm,
        String livingActivity,
        Map<String, Double> stats,
        Map<String, Double> livingStats,
        Map<String, Double> mapDna,
        Instant createdAt,
        Instant updatedAt
) {
}
