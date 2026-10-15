-- Only safe to run while container_map still has at most one row per
-- container (ie before a second supplier ref has been added to any of them).
alter table container_map drop constraint container_map_container_supplier_ref_key;
alter table container_map drop constraint container_map_pkey;
alter table container_map drop column id;
alter table container_map add primary key (container);
