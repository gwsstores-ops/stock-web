-- One-time data fix + a constraint to stop it recurring.
--
-- Found: 8 pairs of `product` rows that show the SAME label in the diameter/length
-- dropdowns but have different underlying diam_value/length_value, because an import
-- had a typo'd value while the display text happened to match an existing, correct
-- row. The app dedupes dropdown options by value, not by displayed text, so both
-- rows show up as two options that look identical (e.g. "12" and "12" in Diameter
-- for TEX SCREWS / AGRI (70mm)).
--
-- This file repoints each bad row's stock_line rows onto the correct row, then
-- deletes the bad row, then adds a constraint so a future import that would create
-- another lookalike duplicate fails loudly (whole import rejected, per
-- 07_import_sync.sql's existing all-or-nothing behaviour) instead of silently
-- creating one.
--
-- Safe to re-run: the UPDATE/DELETE pairs are no-ops once applied, and
-- ADD CONSTRAINT IF NOT EXISTS-style is emulated with a DO block guard.
-- Rollback: there is no automatic rollback for the data fix (the bad rows are
-- gone); restore from a backup if needed. To remove just the constraint:
--   alter table product drop constraint product_display_label_unique;

begin;

-- TEX SCREWS / AGRI (70mm): diam_value 5.5 should have been 12 (typo).
update stock_line set product_id = 233 where product_id = 206;
delete from product where id = 206;

-- BOLTS / BOLT ZP, size 20 X 300: length_display was left as "60" from a copy/paste.
update stock_line set product_id = 9 where product_id = 752;
delete from product where id = 752;

-- ASSEMBLED / ASS HDG, size 16 X 40: diam_value 6 should have been 16 (typo).
update stock_line set product_id = 89 where product_id = 35;
delete from product where id = 35;

-- Nuts: two rows per size with length_value 0 vs 1, both displayed as "-".
update stock_line set product_id = 1030 where product_id = 1097; -- HEX NUT ZP M8
delete from product where id = 1097;

update stock_line set product_id = 2 where product_id = 1066;    -- HEX NUT HDG G10 M20
delete from product where id = 1066;

update stock_line set product_id = 885 where product_id = 224;   -- WELD NUT M12
delete from product where id = 224;

update stock_line set product_id = 593 where product_id = 1067;  -- HEX NUT ZP M12
delete from product where id = 1067;

update stock_line set product_id = 807 where product_id = 328;   -- LOCK NUT ZP M12
delete from product where id = 328;

-- Prevent recurrence: two product rows can never again show the same label in the
-- same item's dropdowns. diam_value/length_value are left unconstrained (free to
-- differ for genuinely different sizes); only the combination buyers actually see
-- must be unique.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_display_label_unique'
  ) then
    alter table product
      add constraint product_display_label_unique
      unique nulls not distinct (cat, item, size, diam_display, length_display);
  end if;
end $$;

commit;
