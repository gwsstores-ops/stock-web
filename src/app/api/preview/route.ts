import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const locationQuery = searchParams.get("location");
    const matchMode = searchParams.get("match");
    const field = searchParams.get("field") === "pallet_id" ? "pallet_id" : "location";

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
        .select(field)
        .ilike(field, locationPattern)
        .order(field, { ascending: true })
        .limit(100);

      if (error) throw error;

      const locations = [
        ...new Set(
          data.map((row) => (row as Record<string, string>)[field]).filter(Boolean)
        )
      ].slice(0, 20);

      return NextResponse.json({ locations });
    }

    const { data, error } = await supabase
      .from("stock")
      .select("id, location, pallet_id, area, item, size, qty, stock_check")
      .ilike(field, locationPattern)
      .order("location", { ascending: true, nullsFirst: false })
      .order("pallet_id", { ascending: true });

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
