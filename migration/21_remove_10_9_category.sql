-- Remove the "10.9" category: its items move into the matching general categories.
--   BOLT 10.9 ZP            -> BOLTS
--   SET 10.9 ZP             -> SETS
--   SET FINE THREAD 10.9 ZP -> SETS (alongside SET FINE THREAD ZP)
-- Two BOLT 10.9 ZP sizes already existed under BOLTS as well, so moving them would break the
-- product unique keys. For those, repoint the 10.9 row's stock lines onto the BOLTS row and
-- delete the 10.9 row:
--   16 X 60: 294 (10.9) -> 381 (BOLTS)
--   14 X 50: 677 (10.9) -> 1137 (BOLTS)
-- Safe to re-run (no-op once applied).
-- Rollback: there is no automatic rollback; restore from a backup if needed.

begin;

update stock_line set product_id = 381 where product_id = 294;  -- BOLT 10.9 ZP 16 X 60
update stock_line set product_id = 1137 where product_id = 677; -- BOLT 10.9 ZP 14 X 50
delete from product where id in (294, 677);

update product set cat = 'BOLTS' where cat = '10.9' and item = 'BOLT 10.9 ZP';
update product set cat = 'SETS' where cat = '10.9' and item in ('SET 10.9 ZP', 'SET FINE THREAD 10.9 ZP');

-- SET 10.9 ZP 11 X 123 (id 1156) was a test entry with no stock lines
delete from product where id = 1156 and not exists (select 1 from stock_line where product_id = 1156);

commit;
