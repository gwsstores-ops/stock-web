import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST() {
  const { error } = await supabaseAdmin()
    .from("stock_line")
    .update({ stock_check: false })
    .gt("id", 0); // updates all rows safely

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
