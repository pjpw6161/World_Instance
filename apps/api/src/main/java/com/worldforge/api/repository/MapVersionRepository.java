package com.worldforge.api.repository;

import com.worldforge.api.domain.MapVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MapVersionRepository extends JpaRepository<MapVersion, UUID> {
    List<MapVersion> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
}
