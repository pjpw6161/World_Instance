package com.worldforge.api.search;

import java.net.URI;

public record ElasticsearchSettings(
        boolean enabled,
        URI url,
        String indexName
) {
}
