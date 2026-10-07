-- Lets Admin -> Add Line create a brand-new product (new diameter/length/size for
-- an existing category+item) instead of refusing when no exact match exists.
-- Previously add_stock_line (12_add_stock_line.sql) deliberately raised an exception
-- here, to avoid manual typos creating near-duplicate catalog rows. The product owner
-- has asked for free-entry diameter/length in Add Line, so this now does the same
-- find-or-create the CSV import already does (stock_import_sync in 07_import_sync.sql) -
-- same trusted logic, now reachable from a second place.
-- Adds a function only; changes no data. Rollback: 15_rollback_add_stock_line_new_product.sql

create or replace function add_stock_line(
  p_area           text,
  p_location       text,
  p_pallet_id      text,
  p_cat            text,
  p_item           text,
  p_size           text,
  p_diam_value     numeric,
  p_diam_display   text,
  p_length_value   numeric,
  p_length_display text,
  p_qty            integer,
  p_note           text default null,
  p_code           text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  ws     constant text := E' \r\n\t';
  v_area text := btrim(p_area, ws);
  v_loc  text := btrim(p_location, ws);
  v_pal  text := coalesce(nullif(btrim(p_pallet_id, ws), ''), v_loc);
  v_bay  bigint;
  v_pid  bigint;
  v_prod bigint;
  v_line bigint;
begin
  if v_area is null or v_area = '' or v_loc is null or v_loc = '' then
    raise exception 'Area and location are required';
  end if;
  if p_qty is null or p_qty < 0 then
    raise exception 'Quantity must be 0 or more';
  end if;

  v_bay := wh_bay(v_area, v_loc);

  insert into pallet (bay_id, label) values (v_bay, v_pal)
  on conflict (bay_id, label) do update set label = excluded.label
  returning id into v_pid;

  select id into v_prod from product
  where cat is not distinct from p_cat and item is not distinct from p_item
    and size is not distinct from p_size and diam_value is not distinct from p_diam_value
    and diam_display is not distinct from p_diam_display
    and length_value is not distinct from p_length_value
    and length_display is not distinct from p_length_display;

  if v_prod is null then
    insert into product (cat, item, size, diam_value, diam_display, length_value, length_display)
    values (p_cat, p_item, p_size, p_diam_value, p_diam_display, p_length_value, p_length_display)
    returning id into v_prod;
  end if;

  insert into stock_line (pallet_id, product_id, qty, note, code, stock_check)
  values (v_pid, v_prod, p_qty, nullif(btrim(p_note, ws), ''), nullif(btrim(p_code, ws), ''), false)
  returning id into v_line;

  return v_line;
end $$;

revoke all on function add_stock_line(
  text, text, text, text, text, text, numeric, text, numeric, text, integer, text, text
) from public, anon, authenticated;
grant execute on function add_stock_line(
  text, text, text, text, text, text, numeric, text, numeric, text, integer, text, text
) to service_role;
