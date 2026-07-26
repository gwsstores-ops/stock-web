import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("stock")
    .select("cat")
    .in("area", ["GWS", "W3", "W4"])
    .not("cat", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const categories = [
    ...new Set(data.map((row) => row.cat).filter(Boolean))
  ].sort();

  return NextResponse.json({
    categories
  });
}
