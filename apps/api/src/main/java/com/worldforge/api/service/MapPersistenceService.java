package com.worldforge.api.service;

import com.worldforge.api.common.ApiException;
import com.worldforge.api.domain.DevUser;
import com.worldforge.api.domain.MapProject;
import com.worldforge.api.domain.MapVersion;
import com.worldforge.api.domain.MapVisibility;
import com.worldforge.api.dto.CreateMapRequest;
import com.worldforge.api.dto.CreateMapVersionRequest;
import com.worldforge.api.dto.MapProjectResponse;
import com.worldforge.api.dto.MapVersionResponse;
import com.worldforge.api.dto.UpdateMapProjectRequest;
import com.worldforge.api.repository.MapProjectRepository;
import com.worldforge.api.repository.MapVersionRepository;
import com.worldforge.api.search.MapSearchProjectionService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.UUID;

@Service
public class MapPersistenceService {
    private final DevUserProvider devUserProvider;
    private final RecipePayloadValidator recipePayloadValidator;
    private final MapProjectRepository mapProjectRepository;
    private final MapVersionRepository mapVersionRepository;
    private final MapSearchProjectionService mapSearchProjectionService;
    private final ObjectMapper objectMapper;

    public MapPersistenceService(
            DevUserProvider devUserProvider,
            RecipePayloadValidator recipePayloadValidator,
            MapProjectRepository mapProjectRepository,
            MapVersionRepository mapVersionRepository,
            MapSearchProjectionService mapSearchProjectionService,
            ObjectMapper objectMapper
    ) {
        this.devUserProvider = devUserProvider;
        this.recipePayloadValidator = recipePayloadValidator;
        this.mapProjectRepository = mapProjectRepository;
        this.mapVersionRepository = mapVersionRepository;
        this.mapSearchProjectionService = mapSearchProjectionService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public MapProjectResponse createMap(CreateMapRequest request) {
        DevUser owner = devUserProvider.currentUser();
        RecipePayload payload = recipePayloadValidator.validate(
                request.recipe(),
                request.stats(),
                request.mapHash(),
                request.thumbnailUrl()
        );
        MapProject project = mapProjectRepository.save(new MapProject(
                owner,
                request.title().trim(),
                normalizeDescription(request.description())
        ));
        MapVersion version = saveVersion(project, payload);
        project.setCurrentVersionId(version.getId());
        return toProjectResponse(project, version);
    }

    @Transactional(readOnly = true)
    public MapProjectResponse getMap(UUID projectId) {
        DevUser owner = devUserProvider.currentUser();
        MapProject project = findOwnedProject(projectId, owner);
        return toProjectResponse(project, currentVersion(project));
    }

    @Transactional(readOnly = true)
    public List<MapProjectResponse> listMyMaps() {
        DevUser owner = devUserProvider.currentUser();
        return mapProjectRepository.findByOwnerIdOrderByUpdatedAtDesc(owner.getId())
                .stream()
                .map(project -> toProjectResponse(project, currentVersion(project)))
                .toList();
    }

    @Transactional
    public MapProjectResponse updateMap(UUID projectId, UpdateMapProjectRequest request) {
        DevUser owner = devUserProvider.currentUser();
        MapProject project = findOwnedProject(projectId, owner);
        MapVisibility previousVisibility = project.getVisibility();
        String title = request.title() == null ? null : request.title().trim();
        if (title != null && title.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "title must not be blank");
        }
        project.updateDetails(title, normalizeOptionalDescription(request.description()), request.visibility());
        MapVersion currentVersion = currentVersion(project);
        if (previousVisibility == MapVisibility.PUBLIC && project.getVisibility() != MapVisibility.PUBLIC) {
            mapSearchProjectionService.removeProjectImmediately(project.getId());
        } else if (project.getVisibility() == MapVisibility.PUBLIC || previousVisibility == MapVisibility.PUBLIC) {
            mapSearchProjectionService.syncProject(project, currentVersion);
        }
        return toProjectResponse(project, currentVersion);
    }

    @Transactional
    public MapVersionResponse createVersion(UUID projectId, CreateMapVersionRequest request) {
        DevUser owner = devUserProvider.currentUser();
        MapProject project = findOwnedProject(projectId, owner);
        RecipePayload payload = recipePayloadValidator.validate(
                request.recipe(),
                request.stats(),
                request.mapHash(),
                request.thumbnailUrl()
        );
        MapVersion version = saveVersion(project, payload);
        project.setCurrentVersionId(version.getId());
        if (project.getVisibility() == MapVisibility.PUBLIC) {
            mapSearchProjectionService.syncProject(project, version);
        }
        return toVersionResponse(version);
    }

    @Transactional(readOnly = true)
    public List<MapVersionResponse> listVersions(UUID projectId) {
        DevUser owner = devUserProvider.currentUser();
        MapProject project = findOwnedProject(projectId, owner);
        return mapVersionRepository.findByProjectIdOrderByCreatedAtDesc(project.getId())
                .stream()
                .map(this::toVersionResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public MapVersionResponse getVersion(UUID versionId) {
        DevUser owner = devUserProvider.currentUser();
        MapVersion version = mapVersionRepository.findById(versionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MAP_VERSION_NOT_FOUND", "Map version not found"));
        if (!version.getProject().getOwner().getId().equals(owner.getId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MAP_VERSION_NOT_FOUND", "Map version not found");
        }
        return toVersionResponse(version);
    }

    private MapProject findOwnedProject(UUID projectId, DevUser owner) {
        MapProject project = mapProjectRepository.findById(projectId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MAP_NOT_FOUND", "Map project not found"));
        if (!project.getOwner().getId().equals(owner.getId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MAP_NOT_FOUND", "Map project not found");
        }
        return project;
    }

    private MapVersion saveVersion(MapProject project, RecipePayload payload) {
        return mapVersionRepository.save(new MapVersion(
                project,
                payload.engineVersion(),
                payload.seed(),
                payload.width(),
                payload.height(),
                toJsonString(payload.recipe()),
                toJsonString(payload.stats()),
                payload.mapHash(),
                payload.thumbnailUrl()
        ));
    }

    private MapVersion currentVersion(MapProject project) {
        UUID currentVersionId = project.getCurrentVersionId();
        if (currentVersionId == null) {
            return null;
        }
        return mapVersionRepository.findById(currentVersionId).orElse(null);
    }

    private MapProjectResponse toProjectResponse(MapProject project, MapVersion currentVersion) {
        return new MapProjectResponse(
                project.getId(),
                project.getOwner().getId(),
                project.getTitle(),
                project.getDescription(),
                project.getVisibility(),
                project.getCurrentVersionId(),
                currentVersion == null ? null : toVersionResponse(currentVersion),
                project.getCreatedAt(),
                project.getUpdatedAt()
        );
    }

    private MapVersionResponse toVersionResponse(MapVersion version) {
        return new MapVersionResponse(
                version.getId(),
                version.getProject().getId(),
                version.getEngineVersion(),
                version.getSeed(),
                version.getWidth(),
                version.getHeight(),
                toJsonNode(version.getRecipeJson()),
                toJsonNode(version.getStatsJson()),
                version.getMapHash(),
                version.getThumbnailUrl(),
                version.getCreatedAt()
        );
    }

    private String normalizeDescription(String description) {
        return description == null ? "" : description.trim();
    }

    private String normalizeOptionalDescription(String description) {
        return description == null ? null : description.trim();
    }

    private String toJsonString(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JSON", "Could not serialize JSON payload");
        }
    }

    private JsonNode toJsonNode(String rawJson) {
        try {
            return objectMapper.readTree(rawJson);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INVALID_STORED_JSON", "Stored JSON payload is invalid");
        }
    }
}
