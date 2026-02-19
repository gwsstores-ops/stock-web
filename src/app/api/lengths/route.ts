import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cat = searchParams.get("cat");
  const item = searchParams.get("item");
  const diam = searchParams.get("diam");

  const { data, error } = await supabase
    .from("stock")
    .select("length_display")
    .eq("cat", cat)
    .eq("item", item)
    .eq("diam_display", diam);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = [...new Set(data.map(row => row.length_display).filter(Boolean))];

  return NextResponse.json({
    lengths: unique.map(l => ({ length_display: l }))
  });
}