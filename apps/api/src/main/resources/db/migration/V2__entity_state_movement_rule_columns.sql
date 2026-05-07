alter table entity_states add column if not exists z float(53);
alter table entity_states add column if not exists home_x integer;
alter table entity_states add column if not exists home_y integer;
alter table entity_states add column if not exists movement_cost_multiplier float(53);
alter table entity_states add column if not exists jump_height float(53);
alter table entity_states add column if not exists max_slope float(53);
