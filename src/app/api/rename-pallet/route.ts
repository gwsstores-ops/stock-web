import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const { id, label } = await req.json();
  const trimmed = typeof label === "string" ? label.trim() : "";

  if (!id || !trimmed) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: line, error: lineError } = await admin
    .from("stock_line")
    .select("pallet_id")
    .eq("id", id)
    .single();

  if (lineError || !line) {
    return NextResponse.json(
      { error: lineError?.message ?? "Stock line not found" },
      { status: 404 }
    );
  }

  const { error } = await admin
    .from("pallet")
    .update({ label: trimmed })
    .eq("id", line.pallet_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
