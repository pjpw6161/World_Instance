package com.worldforge.api.service;

import com.worldforge.api.auth.JwtService;
import com.worldforge.api.auth.PasswordHasher;
import com.worldforge.api.common.ApiException;
import com.worldforge.api.domain.AppUser;
import com.worldforge.api.dto.AuthResponse;
import com.worldforge.api.dto.LoginRequest;
import com.worldforge.api.dto.SignUpRequest;
import com.worldforge.api.dto.UserResponse;
import com.worldforge.api.repository.AppUserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
public class AuthService {
    private final AppUserRepository appUserRepository;
    private final CurrentUserProvider currentUserProvider;
    private final PasswordHasher passwordHasher;
    private final JwtService jwtService;

    public AuthService(
            AppUserRepository appUserRepository,
            CurrentUserProvider currentUserProvider,
            PasswordHasher passwordHasher,
            JwtService jwtService
    ) {
        this.appUserRepository = appUserRepository;
        this.currentUserProvider = currentUserProvider;
        this.passwordHasher = passwordHasher;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthResponse signUp(SignUpRequest request) {
        String email = normalizeEmail(request.email());
        if (appUserRepository.findByEmail(email).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "EMAIL_ALREADY_REGISTERED", "Email is already registered");
        }
        AppUser user = appUserRepository.save(new AppUser(
                email,
                request.nickname().trim(),
                passwordHasher.hash(request.password())
        ));
        return authResponse(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        AppUser user = appUserRepository.findByEmail(normalizeEmail(request.email()))
                .orElseThrow(() -> invalidCredentials());
        if (!passwordHasher.verify(request.password(), user.getPasswordHash())) {
            throw invalidCredentials();
        }
        return authResponse(user);
    }

    @Transactional(readOnly = true)
    public UserResponse me() {
        return UserResponse.fromUser(currentUserProvider.currentUser());
    }

    private AuthResponse authResponse(AppUser user) {
        JwtService.IssuedToken token = jwtService.issueToken(user);
        return new AuthResponse(
                UserResponse.fromUser(user),
                token.value(),
                "Bearer",
                token.expiresAt()
        );
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }
}
