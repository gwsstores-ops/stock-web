import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const cat = searchParams.get("cat");
    const item = searchParams.get("item");
    const diam = searchParams.get("diam");
    const length = searchParams.get("length");

    let query = supabase.from("stock").select("*");

    if (cat) query = query.eq("cat", cat);
    if (item) query = query.eq("item", item);
    if (diam) query = query.eq("diam_display", diam);
    if (length) query = query.eq("length_display", length);

    const { data, error } = await query.order("location", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ rows: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Search failed" },
      { status: 500 }
    );
  }
}