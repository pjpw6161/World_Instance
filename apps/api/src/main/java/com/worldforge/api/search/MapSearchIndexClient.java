package com.worldforge.api.search;

import java.util.List;
import java.util.UUID;

public interface MapSearchIndexClient {
    void index(MapSearchDocument document);

    void delete(UUID projectId);

    void replaceAll(List<MapSearchDocument> documents);

    MapSearchResponse search(MapSearchRequest request);

    MapSearchResponse similar(UUID projectId, int size);

    MapSearchFacetsResponse facets();
}
