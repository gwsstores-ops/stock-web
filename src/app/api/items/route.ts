import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cat = searchParams.get("cat");

  if (!cat) {
    return NextResponse.json({ items: [] });
  }

  const { data, error } = await supabase
    .from("stock")
    .select("item")
    .eq("cat", cat)
    .not("item", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = [...new Set(data.map((r) => r.item))].sort();

  return NextResponse.json({ items: unique });
}
