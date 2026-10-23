import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";

// Distinct sizes in the product catalogue for a cat/item/diam(/length),
// regardless of whether any of it is currently in stock.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cat = searchParams.get("cat");
  const item = searchParams.get("item");
  const diam = searchParams.get("diam");
  const length = searchParams.get("length");

  if (!cat || !item || !diam) {
    return NextResponse.json({ sizes: [] });
  }

  const { data, error } = await fetchAllPages<{ size: string | null }>((from, to) => {
    let query = supabase
      .from("product")
      .select("size")
      .eq("cat", cat)
      .eq("item", item)
      .eq("diam_value", Number(diam));

    if (length) query = query.eq("length_value", Number(length));

    return query.order("id", { ascending: true }).range(from, to);
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sizes = [...new Set((data ?? []).map((row) => row.size).filter(Boolean))];

  return NextResponse.json({ sizes });
}
