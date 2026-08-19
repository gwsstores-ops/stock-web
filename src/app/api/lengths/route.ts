import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cat = searchParams.get("cat");
  const item = searchParams.get("item");
  const diam = searchParams.get("diam");

  const { data, error } = await fetchAllPages<{
    length_value: number | null;
    length_display: string | null;
  }>((from, to) =>
    supabase
      .from("stock")
      .select("length_value, length_display")
      .eq("cat", cat)
      .eq("item", item)
      .eq("diam_value", Number(diam))
      .in("area", ["GWS", "W3", "W4"])
      .order("id", { ascending: true })
      .range(from, to)
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = new Map<string, string>();

  for (const row of data ?? []) {
    if (row.length_value === null) continue;

    const value = String(row.length_value);
    const label = row.length_display || value;
    const currentLabel = unique.get(value);

    if (!currentLabel || (!/[A-Za-z]/.test(currentLabel) && /[A-Za-z]/.test(label))) {
      unique.set(value, label);
    }
  }

  return NextResponse.json({
    lengths: [...unique].map(([value, label]) => ({ value, label }))
  });
}
