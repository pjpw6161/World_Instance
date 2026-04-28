package com.worldforge.api.controller;

import com.worldforge.api.dto.CreateMapRequest;
import com.worldforge.api.dto.CreateMapVersionRequest;
import com.worldforge.api.dto.MapProjectResponse;
import com.worldforge.api.dto.MapVersionResponse;
import com.worldforge.api.dto.UpdateMapProjectRequest;
import com.worldforge.api.service.MapPersistenceService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class MapController {
    private final MapPersistenceService mapPersistenceService;

    public MapController(MapPersistenceService mapPersistenceService) {
        this.mapPersistenceService = mapPersistenceService;
    }

    @PostMapping("/maps")
    @ResponseStatus(HttpStatus.CREATED)
    MapProjectResponse createMap(@Valid @RequestBody CreateMapRequest request) {
        return mapPersistenceService.createMap(request);
    }

    @GetMapping("/maps/{projectId}")
    MapProjectResponse getMap(@PathVariable UUID projectId) {
        return mapPersistenceService.getMap(projectId);
    }

    @GetMapping("/me/maps")
    List<MapProjectResponse> listMyMaps() {
        return mapPersistenceService.listMyMaps();
    }

    @PatchMapping("/maps/{projectId}")
    MapProjectResponse updateMap(
            @PathVariable UUID projectId,
            @Valid @RequestBody UpdateMapProjectRequest request
    ) {
        return mapPersistenceService.updateMap(projectId, request);
    }

    @PostMapping("/maps/{projectId}/versions")
    @ResponseStatus(HttpStatus.CREATED)
    MapVersionResponse createVersion(
            @PathVariable UUID projectId,
            @Valid @RequestBody CreateMapVersionRequest request
    ) {
        return mapPersistenceService.createVersion(projectId, request);
    }

    @GetMapping("/maps/{projectId}/versions")
    List<MapVersionResponse> listVersions(@PathVariable UUID projectId) {
        return mapPersistenceService.listVersions(projectId);
    }

    @GetMapping("/map-versions/{versionId}")
    MapVersionResponse getVersion(@PathVariable UUID versionId) {
        return mapPersistenceService.getVersion(versionId);
    }
}
