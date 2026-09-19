-- Upgrade for a database that already ran 01-03 (and maybe 04) in their FIRST form.
-- Run this, then 04_read_views.sql. Idempotent.
--
-- a code belongs to the stock line, exactly like the old `stock.code` column,
-- not to the product. Reads `stock`; changes only the new tables. Safe to re-run.
begin;

alter table stock_line add column if not exists code text;

update stock_line sl
set code = nullif(btrim(s.code, E' \r\n\t'), '')
from stock s
where s.id = sl.id;

create index if not exists stock_line_code_idx on stock_line (code);

-- code is added at the end so existing column positions do not move
create or replace view stock_flat as
select sl.id, b.label as location, b.area as area, p.item, p.size, sl.qty, p.cat,
       sl.stock_check, p.diam_value, p.diam_display, p.length_value, p.length_display,
       sl.note as "NOTE", pal.label as pallet_id, sl.code
from stock_line sl
join pallet  pal on pal.id = sl.pallet_id
join bay     b   on b.id   = pal.bay_id
join product p   on p.id   = sl.product_id;

drop view  if exists stock_code_search;
drop table if exists product_code;

commit;
