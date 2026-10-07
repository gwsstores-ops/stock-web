import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { escapeLike } from "@/lib/exactMatch";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";

type PreviewRow = {
  location: string | null;
  qty: number | null;
};

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area")?.trim();
    const prefix = searchParams.get("prefix")?.trim() ?? "";

    if (!area) {
      return NextResponse.json({ error: "Missing area" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("stock_flat")
      .select("location, qty")
      .eq("area", area)
      .ilike("location", `${escapeLike(prefix)}%`);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as PreviewRow[];
    const byLocation = new Map<string, { lines: number; qty: number }>();

    for (const row of rows) {
      const location = row.location ?? "—";
      const entry = byLocation.get(location) ?? { lines: 0, qty: 0 };
      entry.lines += 1;
      entry.qty += row.qty ?? 0;
      byLocation.set(location, entry);
    }

    const locations = Array.from(byLocation.entries())
      .map(([location, totals]) => ({ location, ...totals }))
      .sort((a, b) => a.location.localeCompare(b.location));

    return NextResponse.json({
      locations,
      totalLines: rows.length,
      totalQty: rows.reduce((sum, row) => sum + (row.qty ?? 0), 0)
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Preview failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
