create table users (
    id uuid not null,
    email varchar(320) not null,
    nickname varchar(80) not null,
    password_hash varchar(255) not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    constraint pk_users primary key (id),
    constraint uk_users_email unique (email)
);

create table map_projects (
    id uuid not null,
    owner_id uuid not null,
    title varchar(255) not null,
    description varchar(2000) not null,
    visibility varchar(255) not null,
    current_version_id uuid,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    constraint pk_map_projects primary key (id),
    constraint fk_map_projects_owner foreign key (owner_id) references users (id)
);

create index idx_map_projects_owner_updated_at on map_projects (owner_id, updated_at desc);
create index idx_map_projects_visibility_updated_at on map_projects (visibility, updated_at desc);

create table map_versions (
    id uuid not null,
    project_id uuid not null,
    engine_version varchar(255) not null,
    seed bigint not null,
    width integer not null,
    height integer not null,
    recipe_json text not null,
    stats_json text not null,
    map_hash varchar(128) not null,
    thumbnail_url varchar(255),
    created_at timestamp(6) with time zone not null,
    constraint pk_map_versions primary key (id),
    constraint fk_map_versions_project foreign key (project_id) references map_projects (id)
);

create index idx_map_versions_project_created_at on map_versions (project_id, created_at desc);

create table world_instances (
    id uuid not null,
    owner_id uuid not null,
    map_version_id uuid not null,
    name varchar(255) not null,
    world_time bigint not null,
    created_at timestamp(6) with time zone not null,
    last_saved_at timestamp(6) with time zone not null,
    constraint pk_world_instances primary key (id),
    constraint fk_world_instances_owner foreign key (owner_id) references users (id),
    constraint fk_world_instances_map_version foreign key (map_version_id) references map_versions (id)
);

create index idx_world_instances_owner_last_saved_at on world_instances (owner_id, last_saved_at desc);

create table entity_states (
    id uuid not null,
    world_instance_id uuid not null,
    entity_key varchar(255) not null,
    entity_type varchar(255) not null,
    layer_id varchar(255) not null,
    x integer not null,
    y integer not null,
    z float(53),
    home_x integer,
    home_y integer,
    movement_cost_multiplier float(53),
    jump_height float(53),
    max_slope float(53),
    state varchar(255) not null,
    behavior varchar(255) not null,
    metadata_json text not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    constraint pk_entity_states primary key (id),
    constraint fk_entity_states_world_instance foreign key (world_instance_id) references world_instances (id),
    constraint uk_entity_state_world_key unique (world_instance_id, entity_key)
);

create index idx_entity_states_world_instance_key on entity_states (world_instance_id, entity_key);
