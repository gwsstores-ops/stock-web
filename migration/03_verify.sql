-- Every check must return ok = true. Read-only.
with cleaned as (
  select id,
         btrim(location, E' \r\n\t') as location, btrim(area, E' \r\n\t') as area,
         btrim(item, E' \r\n\t') as item, btrim(size, E' \r\n\t') as size, qty,
         btrim(cat, E' \r\n\t') as cat, coalesce(stock_check,false) as stock_check,
         diam_value, btrim(diam_display, E' \r\n\t') as diam_display, length_value,
         btrim(length_display, E' \r\n\t') as length_display,
         nullif(btrim("NOTE", E' \r\n\t'), '') as "NOTE",
         btrim(pallet_id, E' \r\n\t') as pallet_id,
         nullif(btrim(code, E' \r\n\t'), '') as code
  from stock
)
select 'same row count' as check,
       (select count(*) from stock) = (select count(*) from stock_line) as ok,
       (select count(*) from stock) as old, (select count(*) from stock_line) as new
union all
select 'every id preserved',
       not exists (select 1 from cleaned c full join stock_flat f using (id)
                   where c.id is null or f.id is null),
       null, null
union all
select 'every column identical',
       not exists (
         select 1 from cleaned c join stock_flat f using (id)
         where (c.location, c.area, c.item, c.size, c.qty, c.cat, c.stock_check,
                c.diam_value, c.diam_display, c.length_value, c.length_display,
                c."NOTE", c.pallet_id, c.code)
               is distinct from
               (f.location, f.area, f.item, f.size, f.qty, f.cat, f.stock_check,
                f.diam_value, f.diam_display, f.length_value, f.length_display,
                f."NOTE", f.pallet_id, f.code)),
       (select count(*) from cleaned c join stock_flat f using (id)
        where (c.location, c.area, c.item, c.size, c.qty, c.cat, c.stock_check,
               c.diam_value, c.diam_display, c.length_value, c.length_display,
               c."NOTE", c.pallet_id, c.code)
              is distinct from
              (f.location, f.area, f.item, f.size, f.qty, f.cat, f.stock_check,
               f.diam_value, f.diam_display, f.length_value, f.length_display,
               f."NOTE", f.pallet_id, f.code)), null
union all
select 'pallet count = distinct (area,location,pallet_id)',
       (select count(*) from pallet) = (select count(*) from (
          select distinct btrim(area,E' \r\n\t'), btrim(location,E' \r\n\t'), btrim(pallet_id,E' \r\n\t') from stock) d),
       (select count(*) from pallet), null
union all
select 'no orphan lines',
       not exists (select 1 from stock_line sl left join pallet p on p.id = sl.pallet_id
                   left join product pr on pr.id = sl.product_id
                   where p.id is null or pr.id is null),
       null, null
union all
select 'total qty unchanged',
       (select coalesce(sum(qty),0) from stock) = (select coalesce(sum(qty),0) from stock_line),
       (select coalesce(sum(qty),0) from stock), (select coalesce(sum(qty),0) from stock_line);
