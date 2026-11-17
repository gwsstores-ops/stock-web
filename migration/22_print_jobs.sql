-- Print queue: the Pallet Label tool adds a job, and the print agent running
-- on the stores PC (print-agent/) collects it and prints it on the Brother.
-- Adds a table only. Rollback: 22_rollback_print_jobs.sql

create table print_job (
  id          bigint generated always as identity primary key,
  name        text not null,
  -- The PDF as base64. Cleared once printed so the table stays small.
  pdf         text,
  -- waiting -> printing -> printed | failed
  status      text not null default 'waiting',
  error       text,
  created_at  timestamptz not null default now(),
  printed_at  timestamptz
);

create index print_job_waiting_idx on print_job (created_at) where status = 'waiting';

alter table print_job enable row level security;

-- No policies: only the API routes touch this table, through the service-role
-- key. New tables no longer get Data API grants automatically.
grant select, insert, update, delete on public.print_job to service_role;
