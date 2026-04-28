package com.worldforge.api.search;

import org.springframework.stereotype.Service;

@Service
public class MapSearchService {
    private final MapSearchIndexClient indexClient;

    public MapSearchService(MapSearchIndexClient indexClient) {
        this.indexClient = indexClient;
    }

    public MapSearchResponse search(MapSearchRequest request) {
        return indexClient.search(request);
    }

    public MapSearchFacetsResponse facets() {
        return indexClient.facets();
    }
}
