---
name: cert-notes
description: Run the GenetiQ cert notes job in Chrome - mark Sales Invoices that have heat numbers with # in Cert Notes (using & bookmarks), export each marked invoice's lines and the invoice list to Excel, and build the ordered zip for the Cert Combine page. Use when the user says "do the cert notes job", "/cert-notes", or similar.
---

# GenetiQ cert notes job

Runs in the user's Chrome through Claude in Chrome (`mcp__claude-in-chrome__*`), on the GenetiQ Web Client at https://ymivub40.nero.intact.cloud/. The user must already be logged in. Never type credentials for them.

## 0. Preflight

- Load the Chrome tools in one ToolSearch call (tabs_context_mcp, navigate, computer, browser_batch, find, javascript_tool, resize_window). Open GenetiQ in a new tab and resize the window to about 1600x1000.
- Find the downloads folder (normally `~/Downloads`). List any `Excel*.xlsx` or `Sales_Invoices_Excel*.xlsx` already there. Ask the user to clear them, or note which ones exist so they are left out later. Never delete them yourself.
- If the user is driving the same tab, stop and wait. Don't fight them for the mouse.

## Part 1 - mark Cert Notes

1. Open the **Sales Invoices** tab.
2. Click the **Number** header to sort ascending.
3. Click the layout button (shows **GWS Default**) and choose **Sales Invoice - Certs Layout**.
4. Type `*` in the **Customer** column filter and press Enter. This shows cert customers only.
5. Go to the **last page** (⏭). The bottom row is the newest invoice.
6. **Already-done check:** if the newest invoice's Cert Notes already contains `&`, type `&` in the **Cert Notes** column filter, then click the filter's funnel icon (right of the box) and choose **Contains**. This is the only filter in the job that uses Contains; every other filter stays on the default **Starts with**, which would miss `#&`.
   - If the newest invoice is the **only** row with `&`, Part 1 was already done in an earlier run. Ask the user: "Part 1 looks done (the newest invoice holds the only `&`). Skip to Part 2?" If they say yes, go to Part 2. If they say no, ask them which invoice to start from.
   - If there is an older `&` too, Part 1 is not finished. Carry on with step 7.
   - Either way, first set the Cert Notes filter back to **Starts with** (funnel icon) and clear the `&`. Part 2's `#` filter needs Starts with.
   - If the user already said Part 1 is done, skip this check and go straight to Part 2.
7. **New bookmark:** if the newest invoice's Cert Notes is not already `&`, add `&` to it with Edit, then Cert Notes, then Continue (F9).
8. **Start point:** the previous session's bookmark is the invoice above it whose Cert Notes contains `&`. The invoices to check are the ones **after** that bookmark, up to and including the newest one.
9. **Read-only scan:** for each invoice in that range, select it and read the lower lines grid's **Confirmation Notes** column.
   - A **heat number** is any real value, for example `3043156002`, `DF16HDD075601A`, `GD9874050625A` or `r-245/r-173`.
   - **Ignore placeholders:** `.` and `na` do not count.
10. **Show the user the plan before editing anything.** List which invoices get `#` and which stay blank, and flag any value you're unsure about. Wait for their go-ahead. After that, do all the edits without stopping for each one.
11. **Edits** (Edit, then Cert Notes, then Continue / F9):
    - an invoice with any heat number gets `#`
    - the **newest** invoice gets `#&` if it has heat numbers, otherwise it stays `&`
    - the **old bookmark** invoice: remove the `&` (`#&` becomes `#`, `&` becomes blank)
    - Before typing, check that the field holds what you expect (blank, or `&`). If it holds anything else, stop and ask.
12. Re-read the grid and confirm every Cert Notes value saved.

## Part 2 - exports for Cert Combine

1. Type `#` in the **Cert Notes** column filter and press Enter.
2. Click the **Number** header **twice** to clear its sort.
3. Click **Customer**, then **Customer Ref**, then **Number**. The headers should show sort order 1, 2 and 3.
4. For each invoice from the top down: select it, click the **⋮** at the right of the **lower (lines) grid header**, then **Export to Excel**. Each download is named `Excel.xlsx`, `Excel (1).xlsx` and so on, in order.
   - **Count the files after every batch.** Now and then an Export to Excel click leaves the menu open and nothing downloads. If the count is one short, find which invoice was missed before going on: compare the last files' contents (with `exceljs`) against the lines grid. A missed one in the middle would show up as two identical files at the end. Then re-export the missed invoice, but only if it was the last one. If it wasn't, stop and ask, because the files would be out of order.
5. **Invoice list:** click the **⋮** at the right of the **upper (invoice) grid header**, then **Export to Excel**. An **Export To Excel** dialog opens. Choose **Export Current Page** (check the pager shows every `#` invoice on one page first), then click **Export**. This downloads `Sales_Invoices_Excel*.xlsx`.
6. **Build the zip:** copy only this run's line exports, in download order, to a folder `certs-YYYY-MM-DD/` named `01.xlsx`, `02.xlsx` and so on, then zip it as `certs-YYYY-MM-DD.zip`. Never rename them to invoice numbers. Cert Combine sorts by the number in the filename and matches the list **by order only**.
7. **Verify** with the repo's `exceljs` (run node from the repo root): the list's data row count equals the file count, and the list's Number column order equals the order the files were exported in. Report both file paths to the user for the Cert Combine page (Step 1 = the zip, Step 2 = the list).

Downloads count as approved: the user asked for them as part of this job. Chrome may ask "Allow multiple downloads?". The user must click Allow; don't approve browser permissions yourself.

## Technical notes (GenetiQ is a Kendo React grid)

- **JS `.click()` does not select grid rows.** Use real mouse clicks. Down arrow selects the next row while the grid has focus, but focus is lost after the Edit dialog closes.
- Reliable row selection: scroll the row into view with JS (`scrollIntoView({block:'center'})`), read its bounding rect, scale it to the screenshot coordinate frame (frame width / `innerWidth`), then click it for real. Check the selected row (`tbody tr.k-selected`) before every Edit or export, and stop if it's wrong.
- **Upper grid:** the `.k-grid` whose header has the `Cert Notes` column title (`span.k-column-title`). **Lower lines grid:** the `.k-grid` with the `Confirmation Notes` header. Read rows from `tbody tr` / `td` innerText. The hidden Products tab has grids too, so always scope to these.
- If the invoice grid shows no rows, drag the splitter (short bar under the invoice pager) down.
- **Edit dialog:** find the Cert Notes input through `label` text `Cert Notes` (`htmlFor`, or the nearest input). Focus and select it with JS, type with real keystrokes, confirm `.value`, then press **F9** to Continue.
- Use `browser_batch` and chain several invoices per call, with an assert step before each one. A long JS `await` loop times out after about 45s, so keep loops in batches instead.
