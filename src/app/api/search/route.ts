import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";

type SearchRow = {
  id: number;
  location: string | null;
  pallet_id: string | null;
  area: string;
  item: string;
  size: string;
  qty: number | null;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const cat = searchParams.get("cat");
    const item = searchParams.get("item");
    const diam = searchParams.get("diam");
    const length = searchParams.get("length");

    const { data, error } = await fetchAllPages<SearchRow>((from, to) => {
      let query = supabase
        .from("stock")
        .select("id, location, pallet_id, area, item, size, qty")
        .in("area", ["GWS", "W3", "W4"]);

      if (cat) query = query.eq("cat", cat);
      if (item) query = query.eq("item", item);
      if (diam) query = query.eq("diam_value", Number(diam));
      if (length) query = query.eq("length_value", Number(length));

      return query
        .order("location", { ascending: true, nullsFirst: false })
        .order("pallet_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ rows: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Search failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
