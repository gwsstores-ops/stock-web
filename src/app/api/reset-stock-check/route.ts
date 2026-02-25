import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST() {
  const { error } = await supabase
    .from("stock")
    .update({ stock_check: false })
    .neq("id", 0); // updates all rows safely

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}