import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";
import { validateBulkStockRows, type ProductRef, type RawStockRow } from "@/lib/stock/bulkAddStock";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { rows } = (await req.json()) as { rows?: RawStockRow[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows to add" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Re-validate server-side against the current catalog - never trust a
    // client-reported "no errors", the product table may have changed since
    // the browser last checked.
    const { data: productData, error: productError } = await admin
      .from("product")
      .select("id, cat, item, size, diam_value, diam_display, length_value, length_display");
    if (productError) throw new Error(productError.message);

    const products: ProductRef[] = (productData ?? []).map((p) => ({
      id: p.id,
      cat: p.cat,
      item: p.item,
      size: p.size,
      diamValue: p.diam_value === null ? null : Number(p.diam_value),
      diamDisplay: p.diam_display,
      lengthValue: p.length_value === null ? null : Number(p.length_value),
      lengthDisplay: p.length_display
    }));

    const results = validateBulkStockRows(rows, products);
    const errorRows = results.filter((r) => r.status === "error");
    if (errorRows.length > 0) {
      return NextResponse.json(
        {
          error: `${errorRows.length} row(s) still have errors - check them again before adding`,
          results
        },
        { status: 400 }
      );
    }

    const payload = results.map((r) => ({
      area: r.row.area,
      location: r.row.location,
      pallet_id: r.row.palletId || null,
      cat: r.row.cat,
      item: r.row.item,
      size: r.row.size,
      diam_value: r.row.diamValue,
      diam_display: r.row.diamDisplay || null,
      length_value: r.row.lengthValue,
      length_display: r.row.lengthDisplay || null,
      qty: r.row.qty,
      note: r.row.note || null,
      code: r.row.code || null
    }));

    const { data: addedCount, error: rpcError } = await admin.rpc("bulk_add_stock", { p_rows: payload });
    if (rpcError) throw new Error(rpcError.message);

    return NextResponse.json({ message: `Added ${addedCount} stock line(s)`, added: addedCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Add failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
