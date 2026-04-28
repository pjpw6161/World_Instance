package com.worldforge.api.search;

import com.worldforge.api.domain.MapProject;
import com.worldforge.api.domain.MapVersion;
import com.worldforge.api.domain.MapVisibility;
import com.worldforge.api.repository.MapProjectRepository;
import com.worldforge.api.repository.MapVersionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class MapSearchReindexService {
    private static final Logger logger = LoggerFactory.getLogger(MapSearchReindexService.class);

    private final ElasticsearchSettings settings;
    private final MapProjectRepository mapProjectRepository;
    private final MapVersionRepository mapVersionRepository;
    private final MapSearchProjectionService projectionService;
    private final MapSearchIndexClient indexClient;

    public MapSearchReindexService(
            ElasticsearchSettings settings,
            MapProjectRepository mapProjectRepository,
            MapVersionRepository mapVersionRepository,
            MapSearchProjectionService projectionService,
            MapSearchIndexClient indexClient
    ) {
        this.settings = settings;
        this.mapProjectRepository = mapProjectRepository;
        this.mapVersionRepository = mapVersionRepository;
        this.projectionService = projectionService;
        this.indexClient = indexClient;
    }

    @Transactional(readOnly = true)
    public MapSearchReindexResponse reindexPublicMaps() {
        List<MapProject> publicProjects = mapProjectRepository.findByVisibilityOrderByUpdatedAtDesc(MapVisibility.PUBLIC);
        List<MapSearchDocument> documents = new ArrayList<>();
        int skipped = 0;

        for (MapProject project : publicProjects) {
            if (project.getCurrentVersionId() == null) {
                skipped += 1;
                continue;
            }
            MapVersion currentVersion = mapVersionRepository.findById(project.getCurrentVersionId()).orElse(null);
            if (currentVersion == null) {
                skipped += 1;
                continue;
            }
            documents.add(projectionService.toDocument(project, currentVersion));
        }

        indexClient.replaceAll(documents);
        MapSearchReindexResponse response = new MapSearchReindexResponse(
                settings.indexName(),
                publicProjects.size(),
                documents.size(),
                skipped,
                Instant.now()
        );
        logger.info(
                "Rebuilt map search index {} from PostgreSQL: publicProjects={}, indexedDocuments={}, skippedProjects={}",
                response.indexName(),
                response.publicProjects(),
                response.indexedDocuments(),
                response.skippedProjects()
        );
        return response;
    }
}
