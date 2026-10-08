-- Lets the Admin -> Floor To GWS tool "accept" a pallet out of GWS-IN into plain
-- GWS stock (the floor stock has actually been shelved/put away), before the daily
-- cron clears it out as expired.
--
-- Can't reuse move_pallet for this: its target-area mapping always rewrites a
-- target of 'GWS' back to 'GWS-IN' (that's the whole point of move_pallet - it's
-- how stock becomes GWS-IN in the first place). This is a separate, narrower
-- operation: only ever matches pallets that are currently GWS-IN, and always lands
-- them in literal 'GWS', clearing moved_to_gws_in_at since they're no longer "recent".
-- Adds a function only; changes no data. Rollback: 16_rollback_accept_gws_in.sql

create or replace function accept_gws_in(p_value text, p_field text default 'pallet_id')
returns integer
language plpgsql as $$
declare
  v_val   text := lower(btrim(p_value));
  n       integer;
  r       record;
  v_final bigint;
begin
  if p_field not in ('pallet_id', 'location') then
    raise exception 'p_field must be pallet_id or location';
  end if;

  insert into move_log (stock_id, location, pallet_id, item, size, qty, old_area, new_area)
  select sl.id, b.label, pal.label, p.item, p.size, sl.qty, b.area, 'GWS'
  from stock_line sl
  join pallet  pal on pal.id = sl.pallet_id
  join bay     b   on b.id   = pal.bay_id
  join product p   on p.id   = sl.product_id
  where b.area = 'GWS-IN'
    and lower(case when p_field = 'location' then b.label else pal.label end) = v_val;
  get diagnostics n = row_count;
  if n = 0 then return 0; end if;

  for r in
    select pal.id as pid, b.label as blabel
    from pallet pal join bay b on b.id = pal.bay_id
    where b.area = 'GWS-IN'
      and lower(case when p_field = 'location' then b.label else pal.label end) = v_val
  loop
    v_final := wh_place_pallet(r.pid, wh_bay('GWS', r.blabel));
    update pallet set moved_to_gws_in_at = null where id = v_final;
  end loop;
  return n;
end $$;

revoke all on function accept_gws_in(text, text) from public, anon, authenticated;
grant execute on function accept_gws_in(text, text) to service_role;
