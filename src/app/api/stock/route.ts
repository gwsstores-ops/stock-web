import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const cat = searchParams.get("cat");
  const item = searchParams.get("item");
  const diam = searchParams.get("diam_value");
  const length = searchParams.get("length_value");

  if (!cat || !item || !diam || !length) {
    return NextResponse.json({ rows: [] });
  }

  const { data, error } = await supabase
  .from("stock")
  .select("*")
  .eq("cat", cat)
  .eq("item", item)
  .eq("diam_value", Number(diam))
  .eq("length_value", Number(length))
  .order("location", { ascending: true });


  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data });
}
