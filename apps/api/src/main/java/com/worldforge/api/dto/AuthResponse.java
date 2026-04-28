package com.worldforge.api.dto;

import java.time.Instant;

public record AuthResponse(
        UserResponse user,
        String token,
        String tokenType,
        Instant expiresAt
) {
}
