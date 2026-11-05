import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAllPages } from "@/lib/supabasePaging";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";
import { validateBulkStockRows, type ProductRef, type RawStockRow } from "@/lib/stock/bulkAddStock";

type ProductRow = {
  id: number;
  cat: string | null;
  item: string | null;
  size: string | null;
  diam_value: number | string | null;
  diam_display: string | null;
  length_value: number | string | null;
  length_display: string | null;
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { rows } = (await req.json()) as { rows?: RawStockRow[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows to check" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    // Every product, paged: a plain select stops at 1000 rows, and a product missed here is
    // wrongly treated as new, then hits product_display_label_unique at insert time.
    const { data, error } = await fetchAllPages<ProductRow>((from, to) =>
      admin
        .from("product")
        .select("id, cat, item, size, diam_value, diam_display, length_value, length_display")
        .order("id", { ascending: true })
        .range(from, to)
    );
    if (error) throw new Error(error.message);

    const products: ProductRef[] = (data ?? []).map((p) => ({
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
    const summary = {
      total: results.length,
      errors: results.filter((r) => r.status === "error").length,
      newProducts: results.filter((r) => r.status === "new-product").length,
      existingProducts: results.filter((r) => r.status === "existing-product").length
    };

    return NextResponse.json({ results, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
