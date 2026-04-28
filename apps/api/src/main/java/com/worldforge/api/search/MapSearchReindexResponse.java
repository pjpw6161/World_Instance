package com.worldforge.api.search;

import java.time.Instant;

public record MapSearchReindexResponse(
        String indexName,
        int publicProjects,
        int indexedDocuments,
        int skippedProjects,
        Instant rebuiltAt
) {
}
