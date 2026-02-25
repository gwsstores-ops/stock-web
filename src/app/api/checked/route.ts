import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area");
  const location = searchParams.get("location");

  let query = supabase
    .from("stock")
    .select("id, location, area, item, size, qty")
    .or("stock_check.is.null,stock_check.eq.false");

  if (area) {
    query = query.eq("area", area);
  }

  if (location) {
    query = query.ilike("location", `${location}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ rows: data });
}