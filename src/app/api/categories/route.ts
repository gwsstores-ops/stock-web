import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("stock")
    .select("cat")
    .not("cat", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = [...new Set(data.map((r) => r.cat))].sort();

  return NextResponse.json({ categories: unique });
}
