import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const locationPrefix = searchParams.get("location");

    if (!locationPrefix) {
      return NextResponse.json(
        { error: "Missing location" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("stock")
      .select("*")
      .ilike("location", `${locationPrefix}%`)
      .order("location", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ rows: data });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Preview failed" },
      { status: 500 }
    );
  }
}
