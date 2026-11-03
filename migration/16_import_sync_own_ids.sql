-- Rows inserted into `stock` failed with "duplicate key value violates unique
-- constraint stock_line_pkey": stock_import_sync() copied NEW.id into stock_line,
-- but lines added through the app (add_stock_line, Bulk Add Stock) only advance
-- stock_line's own counter, so stock's counter fell behind and reused taken ids.
--
-- stock_line now hands out its own id for imported rows; nothing relies on
-- stock.id matching stock_line.id (`stock` is only an inbox, see 07_import_sync.sql).
-- Rollback: re-run 07_import_sync.sql

-- unblock an insert that is already colliding
select setval('stock_id_seq', greatest((select max(id) from stock_line), (select coalesce(max(id), 1) from stock)));

create or replace function stock_import_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ws      constant text := E' \r\n\t';
  v_area  text := btrim(NEW.area, ws);
  v_loc   text := btrim(NEW.location, ws);
  v_pal   text := coalesce(nullif(btrim(NEW.pallet_id, ws), ''), btrim(NEW.location, ws));
  v_cat   text := btrim(NEW.cat, ws);
  v_item  text := btrim(NEW.item, ws);
  v_size  text := btrim(NEW.size, ws);
  v_dd    text := btrim(NEW.diam_display, ws);
  v_ld    text := btrim(NEW.length_display, ws);
  v_dv    numeric := NEW.diam_value;
  v_lv    numeric := NEW.length_value;
  v_bay   bigint;
  v_pid   bigint;
  v_prod  bigint;
begin
  if v_area is null or v_loc is null then
    raise exception 'stock import: area and location are required (row id %)', NEW.id;
  end if;

  v_bay := wh_bay(v_area, v_loc);

  insert into pallet (bay_id, label) values (v_bay, v_pal)
  on conflict (bay_id, label) do update set label = excluded.label
  returning id into v_pid;

  select id into v_prod from product
  where cat is not distinct from v_cat and item is not distinct from v_item
    and size is not distinct from v_size and diam_value is not distinct from v_dv
    and diam_display is not distinct from v_dd and length_value is not distinct from v_lv
    and length_display is not distinct from v_ld;
  if v_prod is null then
    insert into product (cat, item, size, diam_value, diam_display, length_value, length_display)
    values (v_cat, v_item, v_size, v_dv, v_dd, v_lv, v_ld)
    returning id into v_prod;
  end if;

  insert into stock_line (pallet_id, product_id, qty, note, code, stock_check)
  values (v_pid, v_prod, NEW.qty, nullif(btrim(NEW."NOTE", ws), ''),
          nullif(btrim(NEW.code, ws), ''), coalesce(NEW.stock_check, false));
  return NEW;
end $$;

revoke all on function stock_import_sync() from public, anon, authenticated;
