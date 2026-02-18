import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cat = searchParams.get("cat");
  const item = searchParams.get("item");

  if (!cat || !item) {
    return NextResponse.json({ diameters: [] });
  }

  const { data, error } = await supabase
    .from("stock")
    .select("diam_value, diam_display")
    .eq("cat", cat)
    .eq("item", item)
    .not("diam_value", "is", null)
    .order("diam_value", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Remove duplicates
  const unique = Array.from(
    new Map(
      data.map((r) => [r.diam_value, r])
    ).values()
  );

  return NextResponse.json({ diameters: unique });
}
