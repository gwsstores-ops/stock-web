-- Read-only helper for the drill-down dropdowns. Adds a view only; changes no table.
-- Safe to re-run. Rollback: drop view stocked_product;

-- Products that currently have stock in a pickable area (what the dropdowns list).
-- first_line_id is the earliest stock line of the product in those areas. The routes
-- order by it so that, when several products share a diameter/length value, the label
-- shown is the one from the earliest stock row - exactly what the old `stock` scan did.
create or replace view stocked_product as
select p.id, p.cat, p.item, p.size, p.diam_value, p.diam_display,
       p.length_value, p.length_display,
       min(sl.id) as first_line_id
from product p
join stock_line sl on sl.product_id = p.id
join pallet pal    on pal.id = sl.pallet_id
join bay b         on b.id   = pal.bay_id
where b.area in ('GWS', 'W3', 'W4')
group by p.id;
