-- Removes ONLY the new tables. The old `stock` and `move_log` tables are never touched.
drop view  if exists stock_flat;
drop table if exists stock_line   cascade;
drop table if exists product_code cascade;
drop table if exists pallet       cascade;
drop table if exists product      cascade;
drop table if exists bay          cascade;
