drop function if exists bulk_clear_stock(text, text);
drop function if exists delete_expired_gws_in();

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
       sl.needs_label
from stock_line sl
join pallet  pal on pal.id = sl.pallet_id
join bay     b   on b.id   = pal.bay_id
join product p   on p.id   = sl.product_id;

drop function if exists move_pallet(text, text, text);
drop function if exists wh_place_pallet(bigint, bigint);

create function wh_place_pallet(p_pallet bigint, p_bay bigint) returns void
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

create function move_pallet(p_value text, p_target text, p_field text default 'pallet_id')
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

revoke all on function wh_place_pallet(bigint, bigint) from public, anon, authenticated;
revoke all on function move_pallet(text, text, text)    from public, anon, authenticated;
grant execute on function wh_place_pallet(bigint, bigint) to service_role;
grant execute on function move_pallet(text, text, text)   to service_role;

alter table pallet drop column if exists moved_to_gws_in_at;
