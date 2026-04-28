package com.worldforge.api.search;

import java.util.List;

public record MapSearchResponse(
        List<MapSearchResultResponse> results,
        long total,
        int page,
        int size
) {
}
