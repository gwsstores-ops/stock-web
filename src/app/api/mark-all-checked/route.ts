import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const { location } = await req.json();

  const { error } = await supabase
    .from("stock")
    .update({ stock_check: true })
    .ilike("location", `${location}%`);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}