-- Track when a pallet most recently became GWS-IN, so the app can show a
-- "recently moved to GWS" section and a daily job can clear it out after 7 days.
-- Also adds a general-purpose bulk-delete function for the Admin Bulk Clear tool.
-- Adds columns/functions only; changes no existing data. Rollback: 14_rollback_gws_in_recent_arrivals.sql

alter table pallet add column if not exists moved_to_gws_in_at timestamptz;

-- wh_place_pallet must return the surviving pallet id (itself, or the pallet it merged
-- into) so move_pallet knows which row to stamp. Return type is changing, so the old
-- function must be dropped first.
drop function if exists wh_place_pallet(bigint, bigint);

create function wh_place_pallet(p_pallet bigint, p_bay bigint) returns bigint
language plpgsql as $$
declare
  v_label  text;
  v_target bigint;
begin
  select label into v_label from pallet where id = p_pallet;
  select id into v_target from pallet where bay_id = p_bay and label = v_label and id <> p_pallet;
  if v_target is null then
    update pallet set bay_id = p_bay where id = p_pallet;
    return p_pallet;
  else
    update stock_line set pallet_id = v_target where pallet_id = p_pallet;
    delete from pallet where id = p_pallet;
    return v_target;
  end if;
end $$;

-- Same behaviour as before, plus: stamp moved_to_gws_in_at when a pallet lands in
-- GWS-IN, clear it if it later moves elsewhere.
create or replace function move_pallet(p_value text, p_target text, p_field text default 'pallet_id')
returns integer
language plpgsql as $$
declare
  v_area  text := case when p_target = 'GWS' then 'GWS-IN' else p_target end;
  v_val   text := lower(btrim(p_value));
  n       integer;
  r       record;
  v_final bigint;
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
    v_final := wh_place_pallet(r.pid, wh_bay(v_area, r.blabel));
    update pallet set moved_to_gws_in_at = case when v_area = 'GWS-IN' then now() else null end
    where id = v_final;
  end loop;
  return n;
end $$;

-- gws_in_since is appended after needs_label (migration 08): CREATE OR REPLACE VIEW
-- cannot change the name or position of an existing output column, only add new ones.
create or replace view stock_flat as
select sl.id,
       b.label   as location,
       b.area    as area,
       p.item,
       p.size,
       sl.qty,
       p.cat,
       sl.stock_check,
       p.diam_value,
       p.diam_display,
       p.length_value,
       p.length_display,
       sl.note   as "NOTE",
       pal.label as pallet_id,
       sl.code,
       sl.needs_label,
       pal.moved_to_gws_in_at as gws_in_since
from stock_line sl
join pallet  pal on pal.id = sl.pallet_id
join bay     b   on b.id   = pal.bay_id
join product p   on p.id   = sl.product_id;

-- Clears out GWS-IN stock that has sat for more than 7 days. Returns stock lines deleted.
-- Called daily by the Vercel Cron route (service key only).
create or replace function delete_expired_gws_in() returns integer
language plpgsql as $$
declare n integer;
begin
  select count(*) into n
  from stock_line sl
  join pallet pal on pal.id = sl.pallet_id
  join bay    b   on b.id   = pal.bay_id
  where b.area = 'GWS-IN' and pal.moved_to_gws_in_at < now() - interval '7 days';

  delete from pallet pal
  using bay b
  where b.id = pal.bay_id
    and b.area = 'GWS-IN' and pal.moved_to_gws_in_at < now() - interval '7 days';

  delete from bay b
  where b.area = 'GWS-IN'
    and not exists (select 1 from pallet pal where pal.bay_id = b.id);

  return n;
end $$;

-- General-purpose bulk delete for the Admin Bulk Clear tool: every stock line in
-- p_area whose location starts with p_location_prefix. Returns stock lines deleted.
-- Caller is responsible for escaping ILIKE wildcards in p_location_prefix.
create or replace function bulk_clear_stock(p_area text, p_location_prefix text) returns integer
language plpgsql as $$
declare n integer;
begin
  select count(*) into n
  from stock_line sl
  join pallet pal on pal.id = sl.pallet_id
  join bay    b   on b.id   = pal.bay_id
  where b.area = p_area and b.label ilike p_location_prefix || '%';

  delete from pallet pal
  using bay b
  where b.id = pal.bay_id
    and b.area = p_area and b.label ilike p_location_prefix || '%';

  delete from bay b
  where b.area = p_area and b.label ilike p_location_prefix || '%'
    and not exists (select 1 from pallet pal where pal.bay_id = b.id);

  return n;
end $$;

revoke all on function wh_place_pallet(bigint, bigint)       from public, anon, authenticated;
revoke all on function move_pallet(text, text, text)         from public, anon, authenticated;
revoke all on function delete_expired_gws_in()                from public, anon, authenticated;
revoke all on function bulk_clear_stock(text, text)           from public, anon, authenticated;
grant execute on function wh_place_pallet(bigint, bigint)     to service_role;
grant execute on function move_pallet(text, text, text)       to service_role;
grant execute on function delete_expired_gws_in()              to service_role;
grant execute on function bulk_clear_stock(text, text)         to service_role;
