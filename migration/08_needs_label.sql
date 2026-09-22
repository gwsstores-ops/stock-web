-- Adds a "needs new label" flag to stock lines, flipped on during a stock check
-- when the printed label is missing/damaged, cleared once a replacement is printed.
-- Adds a column and re-exposes it on stock_flat only; changes no data.
-- Rollback: alter table stock_line drop column needs_label; then re-run this file's
-- "create or replace view" block with the needs_label line removed.

alter table stock_line add column if not exists needs_label boolean not null default false;

-- needs_label is appended at the end: CREATE OR REPLACE VIEW cannot change the
-- name or position of an existing output column, only add new ones after them.
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
