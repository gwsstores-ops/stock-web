import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("stock")
    .select("area, location");

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