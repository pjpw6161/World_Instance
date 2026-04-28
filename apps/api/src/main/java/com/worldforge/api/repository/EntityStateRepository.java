package com.worldforge.api.repository;

import com.worldforge.api.domain.EntityState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EntityStateRepository extends JpaRepository<EntityState, UUID> {
    List<EntityState> findByWorldInstanceIdOrderByEntityKeyAsc(UUID worldInstanceId);

    void deleteByWorldInstanceId(UUID worldInstanceId);
}
