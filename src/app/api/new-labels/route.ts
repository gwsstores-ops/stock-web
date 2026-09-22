import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("stock_flat")
    .select("id, location, pallet_id, area, item, size, qty")
    .eq("needs_label", true)
    .order("location", { ascending: true, nullsFirst: false })
    .order("pallet_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
