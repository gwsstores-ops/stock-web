# Normalised stock schema: how to go live

The old `stock` table is never modified by anything in this folder.

| File | What it does |
|---|---|
| `01_schema.sql` | Creates bay / pallet / product / stock_line + the read-only `stock_flat` view |
| `02_migrate.sql` | Copies `stock` into the new tables (refuses to run if they are not empty) |
| `03_verify.sql` | Every row must say `ok = true` |
| `04_read_views.sql` | `stocked_product` view for the drill-down dropdowns |
| `05_line_code.sql` | Upgrade for databases that ran the first form of 01-03 (not needed on a fresh run) |
| `06_write_functions.sql` | `move_pallet`, `relocate_pallet`, `mark_location_checked` (service key only) |
| `07_import_sync.sql` | Trigger on `stock`: rows imported into `stock` (CSV import) are also added to the new tables |
| `99_rollback.sql` / `06_rollback_functions.sql` / `07_rollback_import_sync.sql` | Remove the new tables / functions / trigger |

Needs `SUPABASE_SERVICE_ROLE_KEY` (server only, never `NEXT_PUBLIC_`) in `.env.local` and in the host's environment settings.

## Cutover (the app writes to the new tables from this point)

1. Back up: `node scripts/backup.mjs`.
2. Refresh the new tables from the current `stock`, so moves made since the first copy are included:
   run `99_rollback.sql`, then `01`, `02`, `04`, `06`, then `03` (all rows `true`).
3. Deploy this branch with `SUPABASE_SERVICE_ROLE_KEY` set.
4. Spot check: search, a move and back, a relocate and back, a stock check.

Between step 2 and step 3 finishing, moves made in the OLD app only reach the old table.
Do steps 2-3 when nobody is moving stock.

## Roll back

Redeploy the previous version of the app. It reads and writes `stock`, which is untouched.
Anything moved through the new app since the cutover exists only in the new tables;
re-apply it by hand from `move_log` if needed.

## Importing new stock after the cutover

Keep importing the container CSV into the `stock` table in Supabase exactly as before. The trigger from
`07_import_sync.sql` copies each imported row into the tables the app reads, in the same statement (if
any row cannot be added the whole import fails and nothing is half-imported).

`stock` is now only an inbox / record of imports. The app does not read it, and moves, relocations and
stock checks are not written back to it. To see the real state, query the `stock_flat` view.
Editing or deleting a row directly in `stock` does NOT change what the app shows.
