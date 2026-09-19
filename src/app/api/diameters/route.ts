import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";
import { cached } from "@/lib/routeCache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cat = searchParams.get("cat");
  const item = searchParams.get("item");

  const { data, error } = await cached(
    `diameters:${cat}:${item}`,
    60_000,
    () =>
      fetchAllPages<{
        diam_value: number | null;
        diam_display: string | null;
      }>((from, to) =>
        supabase
          .from("stocked_product")
          .select("diam_value, diam_display")
          .eq("cat", cat)
          .eq("item", item)
          .order("first_line_id", { ascending: true })
          .range(from, to)
      )
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = new Map<string, string>();

  for (const row of data ?? []) {
    if (row.diam_value === null) continue;

    const value = String(row.diam_value);
    if (!unique.has(value)) {
      unique.set(value, row.diam_display || value);
    }
  }

  return NextResponse.json({
    diameters: [...unique].map(([value, label]) => ({ value, label }))
  });
}
