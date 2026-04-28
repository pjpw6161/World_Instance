package com.worldforge.api.search;

import java.util.UUID;

public interface MapSearchIndexClient {
    void index(MapSearchDocument document);

    void delete(UUID projectId);

    MapSearchResponse search(MapSearchRequest request);

    MapSearchFacetsResponse facets();
}
