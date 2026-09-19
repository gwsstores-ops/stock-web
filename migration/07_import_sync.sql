-- Keep importing stock into the `stock` table exactly as before.
-- Every row inserted into `stock` is also added to the new tables the app reads
-- (bay / pallet / product / stock_line), in the same statement: if it cannot be
-- added, the whole import fails and nothing is half-imported.
--
-- `stock` itself is now only an inbox / record of imports: the app no longer reads it,
-- and moves or edits are not copied back to it. Look at the `stock_flat` view for the real state.
-- Adds a trigger and function only; changes no data. Rollback: 07_rollback_import_sync.sql

-- An import must not be refused for something the old table accepted (a blank size,
-- a blank diameter, a negative quantity), and blanks must stay blanks so the app behaves
-- as it did: a line with no diameter is not listed in the diameter dropdown.
alter table stock_line drop constraint if exists stock_line_qty_check;
alter table product
  alter column cat          drop not null,
  alter column item         drop not null,
  alter column size         drop not null,
  alter column diam_value   drop not null,
  alter column diam_display drop not null,
  alter column length_value drop not null;

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

  insert into stock_line (id, pallet_id, product_id, qty, note, code, stock_check)
  overriding system value
  values (NEW.id, v_pid, v_prod, NEW.qty, nullif(btrim(NEW."NOTE", ws), ''),
          nullif(btrim(NEW.code, ws), ''), coalesce(NEW.stock_check, false));

  -- new imports must not collide with ids later handed out by stock_line's own counter
  perform setval(pg_get_serial_sequence('stock_line', 'id'), (select max(id) from stock_line));
  return NEW;
end $$;

revoke all on function stock_import_sync() from public, anon, authenticated;

drop trigger if exists stock_import_sync on stock;
create trigger stock_import_sync after insert on stock
  for each row execute function stock_import_sync();
