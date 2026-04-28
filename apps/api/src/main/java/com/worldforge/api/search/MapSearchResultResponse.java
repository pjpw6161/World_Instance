package com.worldforge.api.search;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record MapSearchResultResponse(
        UUID projectId,
        UUID versionId,
        String title,
        String description,
        String mapType,
        String mapHash,
        String engineVersion,
        int width,
        int height,
        List<String> features,
        String terrainAlgorithm,
        String caveAlgorithm,
        String roadAlgorithm,
        String objectPlacementAlgorithm,
        Map<String, Double> stats,
        Instant createdAt,
        Instant updatedAt
) {
    public static MapSearchResultResponse fromDocument(MapSearchDocument document) {
        return new MapSearchResultResponse(
                document.projectId(),
                document.versionId(),
                document.title(),
                document.description(),
                document.mapType(),
                document.mapHash(),
                document.engineVersion(),
                document.width(),
                document.height(),
                document.features(),
                document.terrainAlgorithm(),
                document.caveAlgorithm(),
                document.roadAlgorithm(),
                document.objectPlacementAlgorithm(),
                document.stats(),
                document.createdAt(),
                document.updatedAt()
        );
    }
}
