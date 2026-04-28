package com.worldforge.api.search;

import java.util.List;

public record MapSearchFacetsResponse(
        List<FacetBucketResponse> mapTypes,
        List<FacetBucketResponse> features,
        List<FacetBucketResponse> terrainAlgorithms,
        List<FacetBucketResponse> caveAlgorithms,
        List<FacetBucketResponse> roadAlgorithms,
        List<FacetBucketResponse> objectPlacementAlgorithms
) {
}
