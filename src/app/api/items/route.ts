import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cat = searchParams.get("cat");

  if (!cat) {
    return NextResponse.json({ items: [] });
  }

  const { data, error } = await fetchAllPages<{ item: string | null }>(
    (from, to) =>
      supabase
        .from("stock")
        .select("item")
        .eq("cat", cat)
        .in("area", ["GWS", "W3", "W4"])
        .not("item", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = [
    ...new Set((data ?? []).map((row) => row.item).filter(Boolean))
  ].sort();

  return NextResponse.json({ items: unique });
}
