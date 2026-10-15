-- Containers tab: last-known positions shown on /containers, fed by the
-- Admin -> Containers tool (screenshot upload + review table).
-- Adds tables only. Rollback: 17_rollback_container_tracking.sql

-- The container -> supplier ref cross reference (previously a CSV file kept by
-- hand). A row is added/updated whenever the admin tool sees a container with
-- a supplier ref typed in, so it only has to be typed once per container.
create table container_map (
  container    text primary key,
  supplier_ref text not null,
  updated_at   timestamptz not null default now()
);

-- One row per container currently being tracked. Each save from the admin
-- tool is a full replace (every row gets the same batch_at), since the
-- screenshot it is read from always shows every container still in transit.
create table container_tracking (
  id                bigint generated always as identity primary key,
  container         text not null,
  supplier_ref      text,
  origin_port       text,
  origin_date       date,
  dest_port         text not null default 'Cork, Ireland',
  eta               date,
  last_location     text,
  last_status       text,
  last_status_date  date,
  batch_at          timestamptz not null default now()
);

create index container_tracking_batch_idx on container_tracking (batch_at);

alter table container_map      enable row level security;
alter table container_tracking enable row level security;

-- Read-only for anon/authenticated, same as the other tables - writes only
-- happen through the admin API routes, which use the service-role key.
create policy read_all on container_map      for select using (true);
create policy read_all on container_tracking for select using (true);
