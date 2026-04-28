package com.worldforge.api.common;

import java.util.List;

public record ErrorResponse(
        String code,
        String message,
        List<String> details
) {
}
