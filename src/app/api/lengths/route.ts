import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cat = searchParams.get("cat");
  const item = searchParams.get("item");
  const diam = searchParams.get("diam_value");

  if (!cat || !item || !diam) {
    return NextResponse.json({ lengths: [] });
  }

  const { data, error } = await supabase
    .from("stock")
    .select("length_value, length_display")
    .eq("cat", cat)
    .eq("item", item)
    .eq("diam_value", Number(diam))
    .not("length_value", "is", null)
    .order("length_value", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = Array.from(
    new Map(
      data.map((r) => [r.length_value, r])
    ).values()
  );

  return NextResponse.json({ lengths: unique });
}
