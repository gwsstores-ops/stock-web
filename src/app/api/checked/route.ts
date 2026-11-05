import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";
import { exactIlike } from "@/lib/exactMatch";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area");
  const location = searchParams.get("location");
  const status = searchParams.get("status");

  // Paged: a plain select stops at 1000 rows, and "all areas" outstanding is well past that.
  const { data, error } = await fetchAllPages((from, to) => {
    let query = supabase
      .from("stock_flat")
      .select("id, location, pallet_id, area, item, size, qty, needs_label");

    query =
      status === "checked"
        ? query.eq("stock_check", true)
        : query.or("stock_check.is.null,stock_check.eq.false");

    if (area) {
      query = query.eq("area", area);
    }

    if (location) {
      query = query.ilike("location", exactIlike(location));
    }

    return query.order("id", { ascending: true }).range(from, to);
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ rows: data });
}