import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";

type CountRow = {
  area: string;
  pallet_id: string | null;
};

export async function GET() {
  const { data, error } = await fetchAllPages<CountRow>((from, to) =>
    supabase
      .from("stock")
      .select("area, pallet_id")
      .in("area", ["W3", "W4"])
      .not("pallet_id", "is", null)
      .range(from, to)
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<string, Set<string>> = {
    W3: new Set(),
    W4: new Set(),
  };

  data?.forEach((row) => {
    if ((row.area === "W3" || row.area === "W4") && row.pallet_id) {
      counts[row.area].add(row.pallet_id);
    }
  });

  return NextResponse.json({
    W3: counts.W3.size,
    W4: counts.W4.size,
  });
}
