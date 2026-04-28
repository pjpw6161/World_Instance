package com.worldforge.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "entity_states",
        uniqueConstraints = @UniqueConstraint(name = "uk_entity_state_world_key", columnNames = {"world_instance_id", "entity_key"})
)
public class EntityState {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "world_instance_id", nullable = false)
    private WorldInstance worldInstance;

    @Column(nullable = false)
    private String entityKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EntityType entityType;

    @Column(nullable = false)
    private String layerId;

    @Column(nullable = false)
    private int x;

    @Column(nullable = false)
    private int y;

    @Column
    private Double z;

    @Column
    private Integer homeX;

    @Column
    private Integer homeY;

    @Column(nullable = false)
    private String state;

    @Column(nullable = false)
    private String behavior;

    @Column(nullable = false, columnDefinition = "text")
    private String metadataJson;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected EntityState() {
    }

    public EntityState(
            WorldInstance worldInstance,
            String entityKey,
            EntityType entityType,
            String layerId,
            int x,
            int y,
            Double z,
            Integer homeX,
            Integer homeY,
            String state,
            String behavior,
            String metadataJson
    ) {
        this.worldInstance = worldInstance;
        this.entityKey = entityKey;
        this.entityType = entityType;
        this.layerId = layerId;
        this.x = x;
        this.y = y;
        this.z = z;
        this.homeX = homeX;
        this.homeY = homeY;
        this.state = state;
        this.behavior = behavior;
        this.metadataJson = metadataJson;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public WorldInstance getWorldInstance() {
        return worldInstance;
    }

    public String getEntityKey() {
        return entityKey;
    }

    public EntityType getEntityType() {
        return entityType;
    }

    public String getLayerId() {
        return layerId;
    }

    public int getX() {
        return x;
    }

    public int getY() {
        return y;
    }

    public Double getZ() {
        return z;
    }

    public Integer getHomeX() {
        return homeX;
    }

    public Integer getHomeY() {
        return homeY;
    }

    public String getState() {
        return state;
    }

    public String getBehavior() {
        return behavior;
    }

    public String getMetadataJson() {
        return metadataJson;
    }
}
