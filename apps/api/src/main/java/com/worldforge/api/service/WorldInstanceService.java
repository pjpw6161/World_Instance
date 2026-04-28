package com.worldforge.api.service;

import com.worldforge.api.common.ApiException;
import com.worldforge.api.domain.DevUser;
import com.worldforge.api.domain.EntityState;
import com.worldforge.api.domain.EntityType;
import com.worldforge.api.domain.MapVersion;
import com.worldforge.api.domain.WorldInstance;
import com.worldforge.api.dto.CreateWorldInstanceRequest;
import com.worldforge.api.dto.EntityStateResponse;
import com.worldforge.api.dto.SaveEntityStateRequest;
import com.worldforge.api.dto.SaveWorldStateRequest;
import com.worldforge.api.dto.WorldInstanceResponse;
import com.worldforge.api.dto.WorldStateResponse;
import com.worldforge.api.repository.EntityStateRepository;
import com.worldforge.api.repository.MapVersionRepository;
import com.worldforge.api.repository.WorldInstanceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class WorldInstanceService {
    private final DevUserProvider devUserProvider;
    private final MapVersionRepository mapVersionRepository;
    private final WorldInstanceRepository worldInstanceRepository;
    private final EntityStateRepository entityStateRepository;
    private final ObjectMapper objectMapper;

    public WorldInstanceService(
            DevUserProvider devUserProvider,
            MapVersionRepository mapVersionRepository,
            WorldInstanceRepository worldInstanceRepository,
            EntityStateRepository entityStateRepository,
            ObjectMapper objectMapper
    ) {
        this.devUserProvider = devUserProvider;
        this.mapVersionRepository = mapVersionRepository;
        this.worldInstanceRepository = worldInstanceRepository;
        this.entityStateRepository = entityStateRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public WorldStateResponse createWorld(CreateWorldInstanceRequest request) {
        DevUser owner = devUserProvider.currentUser();
        MapVersion mapVersion = findOwnedMapVersion(request.mapVersionId(), owner);
        long worldTime = request.worldTime() == null ? 0L : request.worldTime();
        WorldInstance worldInstance = worldInstanceRepository.save(new WorldInstance(
                owner,
                mapVersion,
                request.name().trim(),
                worldTime
        ));
        saveEntities(worldInstance, request.entities() == null ? List.of() : request.entities());
        return toWorldStateResponse(worldInstance);
    }

    @Transactional(readOnly = true)
    public WorldStateResponse getWorld(UUID worldInstanceId) {
        DevUser owner = devUserProvider.currentUser();
        return toWorldStateResponse(findOwnedWorld(worldInstanceId, owner));
    }

    @Transactional(readOnly = true)
    public List<WorldInstanceResponse> listMyWorlds() {
        DevUser owner = devUserProvider.currentUser();
        return worldInstanceRepository.findByOwnerIdOrderByLastSavedAtDesc(owner.getId())
                .stream()
                .map(this::toWorldInstanceResponse)
                .toList();
    }

    @Transactional
    public WorldStateResponse saveWorldState(UUID worldInstanceId, SaveWorldStateRequest request) {
        DevUser owner = devUserProvider.currentUser();
        WorldInstance worldInstance = findOwnedWorld(worldInstanceId, owner);
        worldInstance.saveWorldTime(request.worldTime());
        entityStateRepository.deleteByWorldInstanceId(worldInstance.getId());
        entityStateRepository.flush();
        saveEntities(worldInstance, request.entities());
        return toWorldStateResponse(worldInstance);
    }

    private MapVersion findOwnedMapVersion(UUID mapVersionId, DevUser owner) {
        MapVersion mapVersion = mapVersionRepository.findById(mapVersionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "MAP_VERSION_NOT_FOUND", "Map version not found"));
        if (!mapVersion.getProject().getOwner().getId().equals(owner.getId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MAP_VERSION_NOT_FOUND", "Map version not found");
        }
        return mapVersion;
    }

    private WorldInstance findOwnedWorld(UUID worldInstanceId, DevUser owner) {
        WorldInstance worldInstance = worldInstanceRepository.findById(worldInstanceId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "WORLD_INSTANCE_NOT_FOUND", "World instance not found"));
        if (!worldInstance.getOwner().getId().equals(owner.getId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "WORLD_INSTANCE_NOT_FOUND", "World instance not found");
        }
        return worldInstance;
    }

    private void saveEntities(WorldInstance worldInstance, List<SaveEntityStateRequest> entities) {
        validateEntities(worldInstance, entities);
        List<EntityState> states = entities.stream()
                .map(entity -> new EntityState(
                        worldInstance,
                        entity.entityKey().trim(),
                        parseEntityType(entity.entityType()),
                        entity.layerId().trim(),
                        entity.x(),
                        entity.y(),
                        entity.z(),
                        entity.homeX(),
                        entity.homeY(),
                        entity.state().trim(),
                        entity.behavior().trim(),
                        toJsonString(entity.metadataJson())
                ))
                .toList();
        entityStateRepository.saveAll(states);
    }

    private void validateEntities(WorldInstance worldInstance, List<SaveEntityStateRequest> entities) {
        List<String> details = new ArrayList<>();
        Set<String> entityKeys = new HashSet<>();
        int width = worldInstance.getMapVersion().getWidth();
        int height = worldInstance.getMapVersion().getHeight();

        for (SaveEntityStateRequest entity : entities) {
            String key = entity.entityKey() == null ? "" : entity.entityKey().trim();
            if (!key.isEmpty() && !entityKeys.add(key)) {
                details.add("entities." + key + " is duplicated");
            }
            validateEntityType(entity.entityType(), key, details);
            validatePoint("entities." + key, entity.x(), entity.y(), width, height, details);
            if (entity.homeX() != null && entity.homeY() != null) {
                validatePoint("entities." + key + ".home", entity.homeX(), entity.homeY(), width, height, details);
            } else if (entity.homeX() != null || entity.homeY() != null) {
                details.add("entities." + key + ".home requires both homeX and homeY");
            }
            if (entity.z() != null && !Double.isFinite(entity.z())) {
                details.add("entities." + key + ".z must be finite");
            }
            JsonNode metadata = entity.metadataJson();
            if (metadata != null && !metadata.isObject()) {
                details.add("entities." + key + ".metadataJson must be an object");
            }
        }

        if (!details.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_WORLD_STATE", "World state validation failed", details);
        }
    }

    private void validatePoint(String prefix, int x, int y, int width, int height, List<String> details) {
        if (x < 0 || x >= width) {
            details.add(prefix + ".x must be between 0 and " + (width - 1));
        }
        if (y < 0 || y >= height) {
            details.add(prefix + ".y must be between 0 and " + (height - 1));
        }
    }

    private void validateEntityType(String value, String key, List<String> details) {
        try {
            parseEntityType(value);
        } catch (ApiException exception) {
            details.add("entities." + key + ".entityType must be player, creature, or npc");
        }
    }

    private EntityType parseEntityType(String value) {
        if (value == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_WORLD_STATE", "entityType is required");
        }
        return switch (value.trim().toLowerCase(Locale.ROOT)) {
            case "player" -> EntityType.PLAYER;
            case "creature" -> EntityType.CREATURE;
            case "npc" -> EntityType.NPC;
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_WORLD_STATE", "Unsupported entityType");
        };
    }

    private WorldStateResponse toWorldStateResponse(WorldInstance worldInstance) {
        return new WorldStateResponse(
                toWorldInstanceResponse(worldInstance),
                entityStateRepository.findByWorldInstanceIdOrderByEntityKeyAsc(worldInstance.getId())
                        .stream()
                        .map(this::toEntityStateResponse)
                        .toList()
        );
    }

    private WorldInstanceResponse toWorldInstanceResponse(WorldInstance worldInstance) {
        return new WorldInstanceResponse(
                worldInstance.getId(),
                worldInstance.getOwner().getId(),
                worldInstance.getMapVersion().getId(),
                worldInstance.getName(),
                worldInstance.getWorldTime(),
                worldInstance.getCreatedAt(),
                worldInstance.getLastSavedAt()
        );
    }

    private EntityStateResponse toEntityStateResponse(EntityState entityState) {
        return new EntityStateResponse(
                entityState.getId(),
                entityState.getWorldInstance().getId(),
                entityState.getEntityKey(),
                toEntityTypeValue(entityState.getEntityType()),
                entityState.getLayerId(),
                entityState.getX(),
                entityState.getY(),
                entityState.getZ(),
                entityState.getHomeX(),
                entityState.getHomeY(),
                entityState.getState(),
                entityState.getBehavior(),
                toJsonNode(entityState.getMetadataJson())
        );
    }

    private String toEntityTypeValue(EntityType entityType) {
        return entityType.name().toLowerCase(Locale.ROOT);
    }

    private String toJsonString(JsonNode node) {
        if (node == null) {
            return "{}";
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JSON", "Could not serialize entity metadata");
        }
    }

    private JsonNode toJsonNode(String rawJson) {
        try {
            return objectMapper.readTree(rawJson);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INVALID_STORED_JSON", "Stored entity metadata is invalid");
        }
    }
}
