package com.worldforge.api.service;

import com.worldforge.api.common.ApiException;
import com.worldforge.api.domain.AppUser;
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
    private final CurrentUserProvider currentUserProvider;
    private final RecipePayloadValidator recipePayloadValidator;
    private final MapProjectRepository mapProjectRepository;
    private final MapVersionRepository mapVersionRepository;
    private final MapSearchProjectionService mapSearchProjectionService;
    private final ObjectMapper objectMapper;

    public MapPersistenceService(
            CurrentUserProvider currentUserProvider,
            RecipePayloadValidator recipePayloadValidator,
            MapProjectRepository mapProjectRepository,
            MapVersionRepository mapVersionRepository,
            MapSearchProjectionService mapSearchProjectionService,
            ObjectMapper objectMapper
    ) {
        this.currentUserProvider = currentUserProvider;
        this.recipePayloadValidator = recipePayloadValidator;
        this.mapProjectRepository = mapProjectRepository;
        this.mapVersionRepository = mapVersionRepository;
        this.mapSearchProjectionService = mapSearchProjectionService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public MapProjectResponse createMap(CreateMapRequest request) {
        AppUser owner = currentUserProvider.currentUser();
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
        MapProject project = findVisibleProject(projectId);
        return toProjectResponse(project, currentVersion(project));
    }

    @Transactional(readOnly = true)
    public List<MapProjectResponse> listMyMaps() {
        AppUser owner = currentUserProvider.currentUser();
        return mapProjectRepository.findByOwnerIdOrderByUpdatedAtDesc(owner.getId())
                .stream()
                .map(project -> toProjectResponse(project, currentVersion(project)))
                .toList();
    }

    @Transactional
    public MapProjectResponse updateMap(UUID projectId, UpdateMapProjectRequest request) {
        AppUser owner = currentUserProvider.currentUser();
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
        AppUser owner = currentUserProvider.currentUser();
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

    @Transactional
    public MapProjectResponse forkMap(UUID projectId) {
        AppUser owner = currentUserProvider.currentUser();
        MapProject sourceProject = findVisibleProject(projectId);
        MapVersion sourceVersion = currentVersion(sourceProject);
        if (sourceVersion == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MAP_VERSION_NOT_FOUND", "Map project has no current version");
        }

        MapProject fork = mapProjectRepository.save(new MapProject(
                owner,
                forkTitle(sourceProject.getTitle()),
                sourceProject.getDescription()
        ));
        MapVersion forkVersion = mapVersionRepository.save(new MapVersion(
                fork,
                sourceVersion.getEngineVersion(),
                sourceVersion.getSeed(),
                sourceVersion.getWidth(),
                sourceVersion.getHeight(),
                sourceVersion.getRecipeJson(),
                sourceVersion.getStatsJson(),
                sourceVersion.getMapHash(),
                sourceVersion.getThumbnailUrl()
        ));
        fork.setCurrentVersionId(forkVersion.getId());
        return toProjectResponse(fork, forkVersion);
    }

    @Transactional(readOnly = true)
    public List<MapVersionResponse> listVersions(UUID projectId) {
        MapProject project = findVisibleProject(projectId);
        return mapVersionRepository.findByProjectIdOrderByCreatedAtDesc(project.getId())
                .stream()
                .map(this::toVersionResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public MapVersionResponse getVersion(UUID versionId) {
        MapVersion version = mapVersionRepository.findById(versionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MAP_VERSION_NOT_FOUND", "Map version not found"));
        if (!canReadProject(version.getProject())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MAP_VERSION_NOT_FOUND", "Map version not found");
        }
        return toVersionResponse(version);
    }

    private MapProject findOwnedProject(UUID projectId, AppUser owner) {
        MapProject project = mapProjectRepository.findById(projectId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MAP_NOT_FOUND", "Map project not found"));
        if (!project.getOwner().getId().equals(owner.getId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MAP_NOT_FOUND", "Map project not found");
        }
        return project;
    }

    private MapProject findVisibleProject(UUID projectId) {
        MapProject project = mapProjectRepository.findById(projectId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MAP_NOT_FOUND", "Map project not found"));
        if (!canReadProject(project)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MAP_NOT_FOUND", "Map project not found");
        }
        return project;
    }

    private boolean canReadProject(MapProject project) {
        if (project.getVisibility() == MapVisibility.PUBLIC) {
            return true;
        }
        return currentUserProvider.currentUserId()
                .map(userId -> project.getOwner().getId().equals(userId))
                .orElse(false);
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

    private String forkTitle(String title) {
        String prefix = "Fork of ";
        String value = prefix + title;
        if (value.length() <= 160) {
            return value;
        }
        return value.substring(0, 160);
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
