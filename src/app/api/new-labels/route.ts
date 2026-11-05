import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";

export async function GET() {
  // Paged: a plain select stops at 1000 rows
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("stock_flat")
      .select("id, location, pallet_id, area, item, size, qty")
      .eq("needs_label", true)
      .order("location", { ascending: true, nullsFirst: false })
      .order("pallet_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
