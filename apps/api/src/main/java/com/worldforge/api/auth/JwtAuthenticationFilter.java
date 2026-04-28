package com.worldforge.api.auth;

import com.worldforge.api.common.ApiException;
import com.worldforge.api.common.ErrorResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.Locale;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private static final String BEARER_PREFIX = "bearer ";

    private final JwtService jwtService;
    private final AuthenticationContext authenticationContext;
    private final ObjectMapper objectMapper;

    public JwtAuthenticationFilter(
            JwtService jwtService,
            AuthenticationContext authenticationContext,
            ObjectMapper objectMapper
    ) {
        this.jwtService = jwtService;
        this.authenticationContext = authenticationContext;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        try {
            String header = request.getHeader("Authorization");
            if (header != null && !header.isBlank()) {
                String normalized = header.toLowerCase(Locale.ROOT);
                if (!normalized.startsWith(BEARER_PREFIX)) {
                    throw new ApiException(
                            org.springframework.http.HttpStatus.UNAUTHORIZED,
                            "INVALID_AUTHORIZATION_HEADER",
                            "Authorization header must use Bearer token"
                    );
                }
                authenticationContext.setCurrentUser(jwtService.authenticate(header.substring(BEARER_PREFIX.length()).trim()));
            }
            filterChain.doFilter(request, response);
        } catch (ApiException exception) {
            response.setStatus(exception.getStatus().value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(objectMapper.writeValueAsString(
                    new ErrorResponse(exception.getCode(), exception.getMessage(), exception.getDetails())
            ));
        } finally {
            authenticationContext.clear();
        }
    }
}
