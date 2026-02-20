import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { location, target } = await req.json();

    if (!location) {
      return NextResponse.json({ error: "Location required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("stock")
      .update({
        area: target === "GWS" ? "GWS-IN" : target
      })
      .ilike("location", `${location}%`)
      .select();

    if (error) throw error;

    return NextResponse.json({
      message: `${data.length} row(s) moved to ${target}`
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Move failed" },
      { status: 500 }
    );
  }
}
