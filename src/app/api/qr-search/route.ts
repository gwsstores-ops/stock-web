import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim();

    if (!code) {
      return NextResponse.json(
        { error: "Missing code" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("stock")
      .select("id, location, area, item, size, qty")
      .eq("code", code)
      .in("area", ["GWS", "W3", "W4"])
      .order("location", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ rows: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "QR search failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
