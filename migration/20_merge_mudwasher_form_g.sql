-- Merge item "MUDWASHER ZP (FORM G)" into "FORM G WASHER ZP" (both OTHER WASHERS).
-- They are the same product under two names. "MUDWASHER ZP (FORM G)" has a single
-- product row, 12 X 36 X 3 (id 476), which matches the existing FORM G WASHER ZP
-- row M12 X 36 X 3 (id 983): same diam/length display ("12" / "36 X 3"). Fix: repoint
-- its one stock line onto 983, then delete 476, so the old item name disappears from
-- the Item dropdowns. Safe to re-run (no-op once applied).
-- Rollback: there is no automatic rollback; restore from a backup if needed.

begin;

update stock_line set product_id = 983 where product_id = 476; -- MUDWASHER ZP (FORM G) 12 X 36 X 3
delete from product where id = 476;

commit;
