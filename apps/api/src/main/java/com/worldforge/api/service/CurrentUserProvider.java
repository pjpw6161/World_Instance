package com.worldforge.api.service;

import com.worldforge.api.auth.AuthenticationContext;
import com.worldforge.api.common.ApiException;
import com.worldforge.api.domain.AppUser;
import com.worldforge.api.repository.AppUserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class CurrentUserProvider {
    private final AuthenticationContext authenticationContext;
    private final AppUserRepository appUserRepository;

    public CurrentUserProvider(AuthenticationContext authenticationContext, AppUserRepository appUserRepository) {
        this.authenticationContext = authenticationContext;
        this.appUserRepository = appUserRepository;
    }

    @Transactional(readOnly = true)
    public AppUser currentUser() {
        UUID userId = authenticationContext.currentUserId()
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Authentication is required"));
        return appUserRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Authenticated user no longer exists"));
    }

    public Optional<UUID> currentUserId() {
        return authenticationContext.currentUserId();
    }
}
