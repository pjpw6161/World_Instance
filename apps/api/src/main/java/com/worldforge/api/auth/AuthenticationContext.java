package com.worldforge.api.auth;

import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
public class AuthenticationContext {
    private final ThreadLocal<AuthenticatedUser> currentUser = new ThreadLocal<>();

    public Optional<AuthenticatedUser> currentUser() {
        return Optional.ofNullable(currentUser.get());
    }

    public Optional<UUID> currentUserId() {
        return currentUser().map(AuthenticatedUser::id);
    }

    void setCurrentUser(AuthenticatedUser user) {
        currentUser.set(user);
    }

    void clear() {
        currentUser.remove();
    }
}
