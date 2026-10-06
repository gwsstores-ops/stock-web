-- One-time data fix for TEX SCREWS Item dropdown clutter caused by the "⚫"
-- (black dot) marker some rows carry in their item text.
--
-- Found two shapes of the same problem:
--   1. A dot-suffixed row and a plain row for the exact same screw, e.g.
--      "GTP1420" and "GTP1420 ⚫" at the same size - two dropdown options for
--      what buyers treat as one product. (11_fix_item_text_duplicates.sql
--      already cleaned up mangled-encoding variants of this marker, but kept
--      the dot in the surviving name; this file goes further and drops it.)
--   2. A dot-suffixed item with no plain counterpart (GTP14 ⚫, GTP28 ⚫) -
--      just noise to strip - plus two of those (GTP12 ⚫, GTP24 ⚫) that also
--      had two rows for themselves at the same size, same bug as (1).
--
-- Also folds in two unrelated exact duplicates found at the same time:
-- GTR14 and GTR1420 each had a second row at the same size holding a single
-- qty-1 "unknown quantity" placeholder pallet instead of being a real
-- different product.
--
-- Pattern throughout: repoint the duplicate's stock_line rows onto the row
-- that survives, delete the duplicate, then (where needed) rename the
-- survivor to drop the "⚫". Safe to re-run (every step is a no-op once
-- applied - the UPDATE/DELETE pairs affect zero rows, and the item renames
-- are idempotent).
-- Rollback: there is no automatic rollback; restore from a backup if needed.

begin;

-- GTP14 ⚫ (12 X 25): no plain counterpart, just drop the dot.
update product set item = 'GTP14' where id = 408 and item = 'GTP14 ⚫';

-- GTP28 ⚫ (14 X 45): no plain counterpart, just drop the dot.
update product set item = 'GTP28' where id = 248 and item = 'GTP28 ⚫';

-- GTP12 ⚫ (12 X 43): two rows for the same screw; keep 98, fold 839 into it,
-- then drop the dot.
update stock_line set product_id = 98 where product_id = 839;
delete from product where id = 839;
update product set item = 'GTP12' where id = 98 and item = 'GTP12 ⚫';

-- GTP24 ⚫ (12 X 38): two rows for the same screw; keep 237, fold 687 into it,
-- then drop the dot.
update stock_line set product_id = 237 where product_id = 687;
delete from product where id = 687;
update product set item = 'GTP24' where id = 237 and item = 'GTP24 ⚫';

-- GTP1420 ⚫ (14 X 22): fold into the existing plain-named row.
update stock_line set product_id = 141 where product_id = 601;
delete from product where id = 601;

-- GCPSTHTP60 ⚫ (14 X 60): fold into the existing plain-named row.
update stock_line set product_id = 5 where product_id = 744;
delete from product where id = 744;

-- GTR14 (12 X 25): fold the qty-1 placeholder row into the row with real stock.
update stock_line set product_id = 1076 where product_id = 759;
delete from product where id = 759;

-- GTR1420 (14 X 22): fold the qty-1 placeholder row into the row with real stock.
update stock_line set product_id = 1058 where product_id = 423;
delete from product where id = 423;

commit;
