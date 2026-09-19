-- Copies stock -> the normalised tables. Read-only against `stock`.
-- Safe to re-run only after 99_rollback.sql (it refuses to run on non-empty tables).
-- Whitespace: stray \r\n from an old CSV import is trimmed on the way in.
begin;

do $$
begin
  if exists (select 1 from stock_line) or exists (select 1 from product) then
    raise exception 'new tables are not empty - run 99_rollback.sql first';
  end if;
end $$;

create temp table src on commit drop as
select id,
       btrim(location, E' \r\n\t')       as location,
       btrim(area, E' \r\n\t')           as area,
       btrim(item, E' \r\n\t')           as item,
       btrim(size, E' \r\n\t')           as size,
       qty,
       btrim(cat, E' \r\n\t')            as cat,
       coalesce(stock_check, false)      as stock_check,
       diam_value,
       btrim(diam_display, E' \r\n\t')   as diam_display,
       length_value,
       btrim(length_display, E' \r\n\t') as length_display,
       nullif(btrim("NOTE", E' \r\n\t'), '') as note,
       nullif(btrim(code, E' \r\n\t'), '')   as code,
       btrim(pallet_id, E' \r\n\t')      as pallet_id
from stock;

insert into bay (area, label)
select distinct area, location from src;

insert into product (cat, item, size, diam_value, diam_display, length_value, length_display)
select distinct cat, item, size, diam_value, diam_display, length_value, length_display from src;

insert into pallet (bay_id, label)
select distinct b.id, s.pallet_id
from src s join bay b on b.area = s.area and b.label = s.location;

insert into stock_line (id, pallet_id, product_id, qty, note, code, stock_check)
overriding system value
select s.id, pal.id, p.id, s.qty, s.note, s.code, s.stock_check
from src s
join bay b      on b.area = s.area and b.label = s.location
join pallet pal on pal.bay_id = b.id and pal.label = s.pallet_id
join product p  on p.cat = s.cat and p.item = s.item and p.size = s.size
               and p.diam_value = s.diam_value and p.diam_display = s.diam_display
               and p.length_value = s.length_value
               and p.length_display is not distinct from s.length_display;

select setval(pg_get_serial_sequence('stock_line', 'id'), (select max(id) from stock_line));

commit;
