-- Second pass of the duplicate-dropdown-option cleanup started in 10: this one is
-- the Item dropdown (and the Container Labels vocab, which reads the same table)
-- rather than Diameter/Length. Four `product` rows had the "black dot" item name
-- saved with an extra space or with the ⚫ emoji mangled into "âš«" by an import
-- that mis-handled text encoding, so they read as duplicates of an existing clean
-- row even though the bytes differ. Fix: repoint their stock lines onto the clean
-- row, then delete the bad row. Safe to re-run (no-op once applied).
-- Rollback: there is no automatic rollback; restore from a backup if needed.

begin;

-- TEX SCREWS / "GCPSTHTP60 ⚫" (14 X 60): two variants of the same item text.
update stock_line set product_id = 744 where product_id = 277; -- "GCPSTHTP60  ⚫" (double space)
delete from product where id = 277;

update stock_line set product_id = 744 where product_id = 456; -- "GCPSTHTP60  âš«" (mangled emoji)
delete from product where id = 456;

-- TEX SCREWS / "GTP1420 ⚫" (14 X 22): mangled emoji variant.
update stock_line set product_id = 601 where product_id = 429; -- "GTP1420 âš«"
delete from product where id = 429;

-- TEX SCREWS / "GTP28 ⚫" (14 X 45): mangled emoji variant.
update stock_line set product_id = 248 where product_id = 1053; -- "GTP28 âš«"
delete from product where id = 1053;

commit;
