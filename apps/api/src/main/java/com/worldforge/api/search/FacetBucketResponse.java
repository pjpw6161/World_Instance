package com.worldforge.api.search;

public record FacetBucketResponse(
        String value,
        long count
) {
}
