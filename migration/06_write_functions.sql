-- Phase 2 (step 2): the write operations the app performs, as single atomic functions.
-- Each one either fully happens or not at all (the old routes logged first, then updated).
-- Callable ONLY with the server's service key: anon/authenticated cannot execute them.
-- Adds functions only; changes no table. Rollback: 06_rollback_functions.sql

-- get-or-create a bay
create or replace function wh_bay(p_area text, p_label text) returns bigint
language sql as $$
  insert into bay (area, label) values (p_area, p_label)
  on conflict (area, label) do update set label = excluded.label
  returning id;
$$;

-- put a pallet into a bay; if that bay already holds a pallet with the same label,
-- merge the lines into it (the old flat table simply had two rows with equal text).
create or replace function wh_place_pallet(p_pallet bigint, p_bay bigint) returns void
language plpgsql as $$
declare
  v_label  text;
  v_target bigint;
begin
  select label into v_label from pallet where id = p_pallet;
  select id into v_target from pallet where bay_id = p_bay and label = v_label and id <> p_pallet;
  if v_target is null then
    update pallet set bay_id = p_bay where id = p_pallet;
  else
    update stock_line set pallet_id = v_target where pallet_id = p_pallet;
    delete from pallet where id = p_pallet;
  end if;
end $$;

-- Move a pallet (or, with p_field = 'location', everything in a bay) to another area.
-- Same bay label, new area. 'GWS' is stored as 'GWS-IN', as the old route did.
-- Writes move_log rows. Returns the number of stock lines moved (0 = nothing matched).
create or replace function move_pallet(p_value text, p_target text, p_field text default 'pallet_id')
returns integer
language plpgsql as $$
declare
  v_area text := case when p_target = 'GWS' then 'GWS-IN' else p_target end;
  v_val  text := lower(btrim(p_value));
  n      integer;
  r      record;
begin
  if p_field not in ('pallet_id', 'location') then
    raise exception 'p_field must be pallet_id or location';
  end if;

  insert into move_log (stock_id, location, pallet_id, item, size, qty, old_area, new_area)
  select sl.id, b.label, pal.label, p.item, p.size, sl.qty, b.area, v_area
  from stock_line sl
  join pallet  pal on pal.id = sl.pallet_id
  join bay     b   on b.id   = pal.bay_id
  join product p   on p.id   = sl.product_id
  where lower(case when p_field = 'location' then b.label else pal.label end) = v_val;
  get diagnostics n = row_count;
  if n = 0 then return 0; end if;

  for r in
    select pal.id as pid, b.label as blabel
    from pallet pal join bay b on b.id = pal.bay_id
    where lower(case when p_field = 'location' then b.label else pal.label end) = v_val
  loop
    perform wh_place_pallet(r.pid, wh_bay(v_area, r.blabel));
  end loop;
  return n;
end $$;

-- Change the location (bay) of a pallet within its area. Returns lines moved.
create or replace function relocate_pallet(p_value text, p_new_location text) returns integer
language plpgsql as $$
declare
  v_val text := lower(btrim(p_value));
  v_new text := btrim(p_new_location);
  n     integer := 0;
  c     integer;
  r     record;
begin
  if v_new = '' then raise exception 'new location is empty'; end if;
  for r in
    select pal.id as pid, b.area as area
    from pallet pal join bay b on b.id = pal.bay_id
    where lower(pal.label) = v_val
  loop
    select count(*) into c from stock_line where pallet_id = r.pid;
    n := n + c;
    perform wh_place_pallet(r.pid, wh_bay(r.area, v_new));
  end loop;
  return n;
end $$;

-- Mark every line in a bay as checked. Returns lines updated.
create or replace function mark_location_checked(p_location text) returns integer
language plpgsql as $$
declare n integer;
begin
  update stock_line sl set stock_check = true
  from pallet pal join bay b on b.id = pal.bay_id
  where sl.pallet_id = pal.id and lower(b.label) = lower(btrim(p_location));
  get diagnostics n = row_count;
  return n;
end $$;

-- Only the server (service key) may call these.
revoke all on function wh_bay(text, text)                    from public, anon, authenticated;
revoke all on function wh_place_pallet(bigint, bigint)       from public, anon, authenticated;
revoke all on function move_pallet(text, text, text)         from public, anon, authenticated;
revoke all on function relocate_pallet(text, text)           from public, anon, authenticated;
revoke all on function mark_location_checked(text)           from public, anon, authenticated;
grant execute on function wh_bay(text, text)                 to service_role;
grant execute on function wh_place_pallet(bigint, bigint)    to service_role;
grant execute on function move_pallet(text, text, text)      to service_role;
grant execute on function relocate_pallet(text, text)        to service_role;
grant execute on function mark_location_checked(text)        to service_role;
