package com.worldforge.api.controller;

import com.worldforge.api.dto.CreateWorldInstanceRequest;
import com.worldforge.api.dto.SaveWorldStateRequest;
import com.worldforge.api.dto.WorldInstanceResponse;
import com.worldforge.api.dto.WorldStateResponse;
import com.worldforge.api.service.WorldInstanceService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class WorldInstanceController {
    private final WorldInstanceService worldInstanceService;

    public WorldInstanceController(WorldInstanceService worldInstanceService) {
        this.worldInstanceService = worldInstanceService;
    }

    @PostMapping("/world-instances")
    @ResponseStatus(HttpStatus.CREATED)
    WorldStateResponse createWorld(@Valid @RequestBody CreateWorldInstanceRequest request) {
        return worldInstanceService.createWorld(request);
    }

    @GetMapping("/world-instances/{worldInstanceId}")
    WorldStateResponse getWorld(@PathVariable UUID worldInstanceId) {
        return worldInstanceService.getWorld(worldInstanceId);
    }

    @GetMapping("/world-instances/{worldInstanceId}/state")
    WorldStateResponse getWorldState(@PathVariable UUID worldInstanceId) {
        return worldInstanceService.getWorld(worldInstanceId);
    }

    @PutMapping("/world-instances/{worldInstanceId}/state")
    WorldStateResponse saveWorldState(
            @PathVariable UUID worldInstanceId,
            @Valid @RequestBody SaveWorldStateRequest request
    ) {
        return worldInstanceService.saveWorldState(worldInstanceId, request);
    }

    @GetMapping("/me/world-instances")
    List<WorldInstanceResponse> listMyWorlds() {
        return worldInstanceService.listMyWorlds();
    }
}
