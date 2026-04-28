package com.worldforge.api.controller;

import com.worldforge.api.common.ApiException;
import com.worldforge.api.search.MapSearchReindexResponse;
import com.worldforge.api.search.MapSearchReindexService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/search")
public class AdminSearchController {
    private final boolean adminEnabled;
    private final MapSearchReindexService reindexService;

    public AdminSearchController(
            @Value("${world-forge.admin.enabled:false}") boolean adminEnabled,
            MapSearchReindexService reindexService
    ) {
        this.adminEnabled = adminEnabled;
        this.reindexService = reindexService;
    }

    @PostMapping("/maps/reindex")
    MapSearchReindexResponse reindexMaps() {
        if (!adminEnabled) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_DISABLED", "Admin search endpoints are disabled");
        }
        return reindexService.reindexPublicMaps();
    }
}
