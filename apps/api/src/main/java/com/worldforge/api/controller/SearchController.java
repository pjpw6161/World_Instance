package com.worldforge.api.controller;

import com.worldforge.api.search.MapSearchFacetsResponse;
import com.worldforge.api.search.MapSearchRequest;
import com.worldforge.api.search.MapSearchRequestParser;
import com.worldforge.api.search.MapSearchResponse;
import com.worldforge.api.search.MapSearchService;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
public class SearchController {
    private final MapSearchRequestParser requestParser;
    private final MapSearchService mapSearchService;

    public SearchController(MapSearchRequestParser requestParser, MapSearchService mapSearchService) {
        this.requestParser = requestParser;
        this.mapSearchService = mapSearchService;
    }

    @GetMapping("/maps")
    MapSearchResponse searchMaps(@RequestParam MultiValueMap<String, String> params) {
        MapSearchRequest request = requestParser.parse(params);
        return mapSearchService.search(request);
    }

    @GetMapping("/maps/{projectId}/similar")
    MapSearchResponse similarMaps(
            @PathVariable UUID projectId,
            @RequestParam MultiValueMap<String, String> params
    ) {
        int size = requestParser.parseSimilarSize(params);
        return mapSearchService.similar(projectId, size);
    }

    @GetMapping("/maps/facets")
    MapSearchFacetsResponse mapFacets() {
        return mapSearchService.facets();
    }
}
