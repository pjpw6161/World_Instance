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
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "map_versions")
public class MapVersion {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private MapProject project;

    @Column(nullable = false)
    private String engineVersion;

    @Column(nullable = false)
    private long seed;

    @Column(nullable = false)
    private int width;

    @Column(nullable = false)
    private int height;

    @Column(nullable = false, columnDefinition = "text")
    private String recipeJson;

    @Column(nullable = false, columnDefinition = "text")
    private String statsJson;

    @Column(nullable = false, length = 128)
    private String mapHash;

    @Column
    private String thumbnailUrl;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected MapVersion() {
    }

    public MapVersion(
            MapProject project,
            String engineVersion,
            long seed,
            int width,
            int height,
            String recipeJson,
            String statsJson,
            String mapHash,
            String thumbnailUrl
    ) {
        this.project = project;
        this.engineVersion = engineVersion;
        this.seed = seed;
        this.width = width;
        this.height = height;
        this.recipeJson = recipeJson;
        this.statsJson = statsJson;
        this.mapHash = mapHash;
        this.thumbnailUrl = thumbnailUrl;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public MapProject getProject() {
        return project;
    }

    public String getEngineVersion() {
        return engineVersion;
    }

    public long getSeed() {
        return seed;
    }

    public int getWidth() {
        return width;
    }

    public int getHeight() {
        return height;
    }

    public String getRecipeJson() {
        return recipeJson;
    }

    public String getStatsJson() {
        return statsJson;
    }

    public String getMapHash() {
        return mapHash;
    }

    public String getThumbnailUrl() {
        return thumbnailUrl;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
