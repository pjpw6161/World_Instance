package com.worldforge.api.repository;

import com.worldforge.api.domain.MapProject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MapProjectRepository extends JpaRepository<MapProject, UUID> {
    List<MapProject> findByOwnerIdOrderByUpdatedAtDesc(UUID ownerId);
}
