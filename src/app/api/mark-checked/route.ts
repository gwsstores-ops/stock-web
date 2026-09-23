import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const { id, value } = await req.json();

  const { error } = await supabaseAdmin()
    .from("stock_line")
    .update({ stock_check: value === false ? false : true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
