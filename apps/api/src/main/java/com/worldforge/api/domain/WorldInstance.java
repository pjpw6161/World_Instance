package com.worldforge.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "world_instances")
public class WorldInstance {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "map_version_id", nullable = false)
    private MapVersion mapVersion;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private long worldTime;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant lastSavedAt;

    protected WorldInstance() {
    }

    public WorldInstance(AppUser owner, MapVersion mapVersion, String name, long worldTime) {
        this.owner = owner;
        this.mapVersion = mapVersion;
        this.name = name;
        this.worldTime = worldTime;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        lastSavedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        lastSavedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public AppUser getOwner() {
        return owner;
    }

    public MapVersion getMapVersion() {
        return mapVersion;
    }

    public String getName() {
        return name;
    }

    public long getWorldTime() {
        return worldTime;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastSavedAt() {
        return lastSavedAt;
    }

    public void saveWorldTime(long worldTime) {
        this.worldTime = worldTime;
    }
}
