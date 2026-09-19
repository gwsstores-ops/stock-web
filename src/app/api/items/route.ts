import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";
import { cached } from "@/lib/routeCache";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cat = searchParams.get("cat");

  if (!cat) {
    return NextResponse.json({ items: [] });
  }

  const { data, error } = await cached(`items:${cat}`, 60_000, () =>
    fetchAllPages<{ item: string | null }>((from, to) =>
      supabase
        .from("stocked_product")
        .select("item")
        .eq("cat", cat)
        .not("item", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
    )
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = [
    ...new Set((data ?? []).map((row) => row.item).filter(Boolean))
  ].sort();

  return NextResponse.json({ items: unique });
}
