package com.worldforge.api.repository;

import com.worldforge.api.domain.DevUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DevUserRepository extends JpaRepository<DevUser, UUID> {
    Optional<DevUser> findByEmail(String email);
}
