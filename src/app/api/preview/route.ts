import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const locationQuery = searchParams.get("location");
    const matchMode = searchParams.get("match");

    if (!locationQuery) {
      return NextResponse.json(
        { error: "Missing location" },
        { status: 400 }
      );
    }

    const locationPattern =
      matchMode === "contains" ? `%${locationQuery}%` : `${locationQuery}%`;

    if (matchMode === "contains") {
      const { data, error } = await supabase
        .from("stock")
        .select("location")
        .ilike("location", locationPattern)
        .order("location", { ascending: true })
        .limit(100);

      if (error) throw error;

      const locations = [
        ...new Set(data.map((row) => row.location).filter(Boolean))
      ].slice(0, 20);

      return NextResponse.json({ locations });
    }

    const { data, error } = await supabase
      .from("stock")
      .select("id, location, area, item, size, qty, stock_check")
      .ilike("location", locationPattern)
      .order("location", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ rows: data });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Preview failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
