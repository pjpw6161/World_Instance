package com.worldforge.api.dto;

import java.util.List;

public record WorldStateResponse(
        WorldInstanceResponse worldInstance,
        List<EntityStateResponse> entities
) {
}
