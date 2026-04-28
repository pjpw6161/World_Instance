package com.worldforge.api.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

@Component
public class JwtSettings {
    private static final String LOCAL_DEFAULT_SECRET = "local-dev-change-me-32-byte-secret";

    private final String secret;
    private final String issuer;
    private final long ttlSeconds;

    public JwtSettings(
            @Value("${world-forge.auth.jwt-secret}") String secret,
            @Value("${world-forge.auth.jwt-issuer:world-forge-api}") String issuer,
            @Value("${world-forge.auth.access-token-ttl-seconds:3600}") long ttlSeconds,
            Environment environment
    ) {
        validateSecret(secret, environment);
        this.secret = secret;
        this.issuer = issuer;
        this.ttlSeconds = ttlSeconds;
    }

    public String secret() {
        return secret;
    }

    public String issuer() {
        return issuer;
    }

    public long ttlSeconds() {
        return ttlSeconds;
    }

    private void validateSecret(String secret, Environment environment) {
        if (!isProductionProfile(environment)) {
            return;
        }
        if (secret == null || secret.isBlank() || LOCAL_DEFAULT_SECRET.equals(secret) || secret.length() < 32) {
            throw new IllegalStateException("Production profile requires WORLD_FORGE_JWT_SECRET to be a non-default secret of at least 32 characters");
        }
    }

    private boolean isProductionProfile(Environment environment) {
        return Arrays.stream(environment.getActiveProfiles())
                .anyMatch(profile -> profile.equalsIgnoreCase("prod") || profile.equalsIgnoreCase("production"));
    }
}
