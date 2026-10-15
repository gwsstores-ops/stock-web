-- A single container can carry more than one supplier's goods (eg
-- TGBU1184973 holding both GDPA (170ES) and GDPA (192ES)), so container_map
-- moves from one row per container to one row per (container, supplier ref)
-- pair. Rollback: 18_rollback_container_map_multi_ref.sql

alter table container_map drop constraint container_map_pkey;
alter table container_map add column id bigint generated always as identity;
alter table container_map add primary key (id);
alter table container_map add constraint container_map_container_supplier_ref_key
  unique (container, supplier_ref);

create index if not exists container_map_container_idx on container_map (container);
