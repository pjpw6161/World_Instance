package com.worldforge.api.search;

import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class MapSearchService {
    private final MapSearchIndexClient indexClient;

    public MapSearchService(MapSearchIndexClient indexClient) {
        this.indexClient = indexClient;
    }

    public MapSearchResponse search(MapSearchRequest request) {
        return indexClient.search(request);
    }

    public MapSearchResponse similar(UUID projectId, int size) {
        return indexClient.similar(projectId, size);
    }

    public MapSearchFacetsResponse facets() {
        return indexClient.facets();
    }
}
