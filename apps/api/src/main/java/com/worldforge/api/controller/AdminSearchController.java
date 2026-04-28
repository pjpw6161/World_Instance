package com.worldforge.api.controller;

import com.worldforge.api.common.ApiException;
import com.worldforge.api.search.MapSearchReindexResponse;
import com.worldforge.api.search.MapSearchReindexService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/api/admin/search")
public class AdminSearchController {
    private static final String ADMIN_TOKEN_HEADER = "X-World-Forge-Admin-Token";

    private final boolean adminEnabled;
    private final String adminToken;
    private final MapSearchReindexService reindexService;

    public AdminSearchController(
            @Value("${world-forge.admin.enabled:false}") boolean adminEnabled,
            @Value("${world-forge.admin.token:}") String adminToken,
            MapSearchReindexService reindexService
    ) {
        this.adminEnabled = adminEnabled;
        this.adminToken = adminToken == null ? "" : adminToken.trim();
        this.reindexService = reindexService;
    }

    @PostMapping("/maps/reindex")
    MapSearchReindexResponse reindexMaps(HttpServletRequest request) {
        if (!adminEnabled) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_DISABLED", "Admin search endpoints are disabled");
        }
        if (adminToken.isBlank()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_TOKEN_NOT_CONFIGURED", "Admin search token is not configured");
        }
        String providedToken = request.getHeader(ADMIN_TOKEN_HEADER);
        if (!constantTimeEquals(adminToken, providedToken)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ADMIN_TOKEN_INVALID", "Admin search token is invalid");
        }
        return reindexService.reindexPublicMaps();
    }

    private boolean constantTimeEquals(String expected, String actual) {
        if (actual == null) {
            return false;
        }
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.trim().getBytes(StandardCharsets.UTF_8)
        );
    }
}
