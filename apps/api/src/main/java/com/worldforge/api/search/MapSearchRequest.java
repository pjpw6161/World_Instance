package com.worldforge.api.search;

import java.util.List;
import java.util.Map;

public record MapSearchRequest(
        String keyword,
        String mapType,
        List<String> features,
        String terrainAlgorithm,
        String caveAlgorithm,
        String roadAlgorithm,
        String objectPlacementAlgorithm,
        Integer minWidth,
        Integer maxWidth,
        Integer minHeight,
        Integer maxHeight,
        Map<String, NumericRange> stats,
        int page,
        int size
) {
}
