package com.worldforge.api.dto;

import com.worldforge.api.domain.AppUser;

import java.time.Instant;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String nickname,
        Instant createdAt,
        Instant updatedAt
) {
    public static UserResponse fromUser(AppUser user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }
}
