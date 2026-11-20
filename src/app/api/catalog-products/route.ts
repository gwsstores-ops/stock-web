import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";
import { cached } from "@/lib/routeCache";

type CatalogProduct = {
  id: number;
  item: string;
  size: string;
  diam_value: number;
  length_value: number;
};

// Every catalogue product in a category, so Stock Check can offer item/size
// dropdowns that only ever point a line at a product that already exists.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cat = searchParams.get("cat");

  if (!cat) {
    return NextResponse.json({ products: [] });
  }

  const { data, error } = await cached(`catalog-products:${cat}`, 60_000, () =>
    fetchAllPages<CatalogProduct>((from, to) =>
      supabase
        .from("product")
        .select("id, item, size, diam_value, length_value")
        .eq("cat", cat)
        .order("id", { ascending: true })
        .range(from, to)
    )
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: data ?? [] });
}
