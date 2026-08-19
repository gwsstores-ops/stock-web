import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";

export async function GET() {
  const { data, error } = await fetchAllPages<{
    area: string;
    location: string;
  }>((from, to) =>
    supabase
      .from("stock")
      .select("area, location")
      .in("area", ["W3", "W4"])
      .not("location", "is", null)
      .order("id", { ascending: true })
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
    if (row.area === "W3" || row.area === "W4") {
      counts[row.area].add(row.location);
    }
  });

  return NextResponse.json({
    W3: counts.W3.size,
    W4: counts.W4.size,
  });
}
