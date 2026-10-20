-- Admin -> Bulk Add Stock: the same find-or-create insert as add_stock_line
-- (15_add_stock_line_new_product.sql) and the CSV import trigger
-- (07_import_sync.sql), but it takes many rows in one call so the whole batch
-- commits or fails together. Replaces "import a CSV into the `stock` table in
-- Supabase and hope the trigger doesn't hit product_display_label_unique"
-- with a tool that validates every row first (src/lib/stock/bulkAddStock.ts)
-- and only calls this once nothing is flagged.
-- Adds a function only; changes no data. Rollback: 19_rollback_bulk_add_stock.sql

create or replace function bulk_add_stock(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  ws     constant text := E' \r\n\t';
  r      jsonb;
  i      integer := 0;
  v_area text;
  v_loc  text;
  v_pal  text;
  v_cat  text;
  v_item text;
  v_size text;
  v_dd   text;
  v_ld   text;
  v_dv   numeric;
  v_lv   numeric;
  v_qty  integer;
  v_bay  bigint;
  v_pid  bigint;
  v_prod bigint;
  n      integer := 0;
begin
  for r in select * from jsonb_array_elements(p_rows)
  loop
    i := i + 1;

    v_area := btrim(r->>'area', ws);
    v_loc  := btrim(r->>'location', ws);
    v_pal  := coalesce(nullif(btrim(r->>'pallet_id', ws), ''), v_loc);
    v_cat  := nullif(btrim(r->>'cat', ws), '');
    v_item := nullif(btrim(r->>'item', ws), '');
    v_size := nullif(btrim(r->>'size', ws), '');
    v_dd   := nullif(btrim(r->>'diam_display', ws), '');
    v_ld   := nullif(btrim(r->>'length_display', ws), '');
    v_dv   := nullif(r->>'diam_value', '')::numeric;
    v_lv   := nullif(r->>'length_value', '')::numeric;
    v_qty  := nullif(r->>'qty', '')::integer;

    if v_area is null or v_area = '' or v_loc is null or v_loc = '' then
      raise exception 'row %: area and location are required', i;
    end if;
    if v_qty is null or v_qty < 0 then
      raise exception 'row %: quantity must be 0 or more', i;
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
    values (
      v_pid, v_prod, v_qty,
      nullif(btrim(r->>'note', ws), ''),
      nullif(btrim(r->>'code', ws), ''),
      false
    );

    n := n + 1;
  end loop;

  return n;
end $$;

revoke all on function bulk_add_stock(jsonb) from public, anon, authenticated;
grant execute on function bulk_add_stock(jsonb) to service_role;
