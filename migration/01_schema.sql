-- Phase 1: normalised tables, built NEXT TO the existing `stock` table.
-- Nothing here changes or reads-for-write the old `stock` / `move_log` tables.
-- Rollback: migration/99_rollback.sql

create table bay (
  id    bigint generated always as identity primary key,
  area  text not null check (area in ('GWS','GWS-IN','W3','W4','CONTAINER')),
  label text not null,
  unique (area, label)
);

-- One physical pallet/position in a bay. `label` is the old stock.pallet_id kept
-- verbatim (e.g. 'H1', 'FRONT', 'FRONT→→→H18', 'EF3 (MIX-13)'): it is not split
-- into slot / id yet because that needs a human decision for the ~80 trail rows.
create table pallet (
  id     bigint generated always as identity primary key,
  bay_id bigint not null references bay on delete restrict,
  label  text   not null,
  unique (bay_id, label)
);

-- One row per distinct product as the labels print it. `size` is free text on
-- purpose: it is NOT derivable from diam/length (M16, 50² X 5 X 21, 3/8 X 1 3/4,
-- '12 X 25 (BLACK)', 'QUARANTINE' ...).
create table product (
  id             bigint generated always as identity primary key,
  cat            text    not null,
  item           text    not null,
  size           text    not null,
  diam_value     numeric not null,
  diam_display   text    not null,
  length_value   numeric not null,
  length_display text,
  unique nulls not distinct (cat, item, size, diam_value, diam_display, length_value, length_display)
);

-- id is copied from the old stock.id so move_log.stock_id and any saved links
-- keep pointing at the same line.
create table stock_line (
  id          bigint generated always as identity primary key,
  pallet_id   bigint  not null references pallet  on delete cascade,
  product_id  bigint  not null references product on delete restrict,
  qty         integer check (qty is null or qty >= 0),
  note        text,
  code        text,                            -- identifies this stock; QR search matches it exactly
  stock_check boolean not null default false   -- kept as-is for phase 1; sessions come later
);

create index stock_line_pallet_idx  on stock_line (pallet_id);
create index stock_line_product_idx on stock_line (product_id);
create index pallet_bay_idx         on pallet (bay_id);
create index product_cat_item_idx   on product (cat, item);
create index stock_line_code_idx    on stock_line (code);

-- Read-only lookalike of the old table, used to prove the copy is exact.
create view stock_flat as
select sl.id,
       b.label   as location,
       b.area    as area,
       p.item,
       p.size,
       sl.qty,
       p.cat,
       sl.stock_check,
       p.diam_value,
       p.diam_display,
       p.length_value,
       p.length_display,
       sl.note   as "NOTE",
       pal.label as pallet_id,
       sl.code
from stock_line sl
join pallet  pal on pal.id = sl.pallet_id
join bay     b   on b.id   = pal.bay_id
join product p   on p.id   = sl.product_id;

-- The new tables are not used by the app yet, so expose them read-only.
-- Write policies are added when the API routes are switched over.
alter table bay          enable row level security;
alter table pallet       enable row level security;
alter table product      enable row level security;
alter table stock_line   enable row level security;

create policy read_all on bay          for select using (true);
create policy read_all on pallet       for select using (true);
create policy read_all on product      for select using (true);
create policy read_all on stock_line   for select using (true);
