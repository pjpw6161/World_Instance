package com.worldforge.api.auth;

import com.worldforge.api.common.ApiException;
import com.worldforge.api.domain.AppUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class JwtService {
    private static final Base64.Encoder BASE64_URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder BASE64_URL_DECODER = Base64.getUrlDecoder();

    private final JwtSettings settings;
    private final ObjectMapper objectMapper;

    public JwtService(JwtSettings settings, ObjectMapper objectMapper) {
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    public IssuedToken issueToken(AppUser user) {
        Instant now = Instant.now();
        Instant expiresAt = now.plusSeconds(settings.ttlSeconds());
        Map<String, Object> header = new LinkedHashMap<>();
        header.put("alg", "HS256");
        header.put("typ", "JWT");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("iss", settings.issuer());
        payload.put("sub", user.getId().toString());
        payload.put("email", user.getEmail());
        payload.put("iat", now.getEpochSecond());
        payload.put("exp", expiresAt.getEpochSecond());

        String unsignedToken = encodeJson(header) + "." + encodeJson(payload);
        String signature = sign(unsignedToken);
        return new IssuedToken(unsignedToken + "." + signature, expiresAt);
    }

    public AuthenticatedUser authenticate(String token) {
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            throw invalidToken();
        }

        String unsignedToken = parts[0] + "." + parts[1];
        if (!MessageDigest.isEqual(sign(unsignedToken).getBytes(StandardCharsets.UTF_8), parts[2].getBytes(StandardCharsets.UTF_8))) {
            throw invalidToken();
        }

        JsonNode payload = decodeJson(parts[1]);
        String issuer = textAt(payload, "iss");
        if (!settings.issuer().equals(issuer)) {
            throw invalidToken();
        }

        long expiresAt = longAt(payload, "exp");
        if (expiresAt <= Instant.now().getEpochSecond()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "TOKEN_EXPIRED", "Bearer token has expired");
        }

        return new AuthenticatedUser(UUID.fromString(textAt(payload, "sub")), textAt(payload, "email"));
    }

    private String encodeJson(Map<String, Object> value) {
        try {
            return BASE64_URL_ENCODER.encodeToString(objectMapper.writeValueAsString(value).getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not serialize JWT payload", exception);
        }
    }

    private JsonNode decodeJson(String encoded) {
        try {
            return objectMapper.readTree(new String(BASE64_URL_DECODER.decode(encoded), StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw invalidToken();
        }
    }

    private String sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(settings.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return BASE64_URL_ENCODER.encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not sign JWT", exception);
        }
    }

    private String textAt(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            throw invalidToken();
        }
        return value.asText();
    }

    private long longAt(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isNumber()) {
            throw invalidToken();
        }
        return value.longValue();
    }

    private ApiException invalidToken() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Bearer token is invalid");
    }

    public record IssuedToken(String value, Instant expiresAt) {
    }
}
