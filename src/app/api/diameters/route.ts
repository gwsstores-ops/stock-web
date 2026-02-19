import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cat = searchParams.get("cat");
  const item = searchParams.get("item");

  const { data, error } = await supabase
    .from("stock")
    .select("diam_display")
    .eq("cat", cat)
    .eq("item", item);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = [...new Set(data.map(row => row.diam_display).filter(Boolean))];

  return NextResponse.json({
    diameters: unique.map(d => ({ diam_display: d }))
  });
}