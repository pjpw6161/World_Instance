package com.worldforge.api.search;

import java.util.List;
import java.util.UUID;

public class NoopMapSearchIndexClient implements MapSearchIndexClient {
    @Override
    public void index(MapSearchDocument document) {
    }

    @Override
    public void delete(UUID projectId) {
    }

    @Override
    public MapSearchResponse search(MapSearchRequest request) {
        return new MapSearchResponse(List.of(), 0, request.page(), request.size());
    }

    @Override
    public MapSearchFacetsResponse facets() {
        return new MapSearchFacetsResponse(List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
    }
}
