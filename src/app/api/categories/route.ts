import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";
import { cached } from "@/lib/routeCache";

export async function GET(req: Request) {
  // catalog=1 lists every product in the catalogue, not just ones currently in stock
  const catalog = new URL(req.url).searchParams.get("catalog") === "1";
  const table = catalog ? "product" : "stocked_product";

  const { data, error } = await cached(`categories:${table}`, 60_000, () =>
    fetchAllPages<{ cat: string | null }>((from, to) =>
      supabase
        .from(table)
        .select("cat")
        .not("cat", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
    )
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const categories = [
    ...new Set((data ?? []).map((row) => row.cat).filter(Boolean))
  ].sort();

  return NextResponse.json({
    categories
  });
}
