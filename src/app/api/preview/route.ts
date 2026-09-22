import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escapeLike, exactIlike } from "@/lib/exactMatch";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const locationQuery = searchParams.get("location");
    const area = searchParams.get("area");
    const matchMode = searchParams.get("match");
    const field = searchParams.get("field") === "pallet_id" ? "pallet_id" : "location";

    if (!locationQuery && !area) {
      return NextResponse.json(
        { error: "Missing location or area" },
        { status: 400 }
      );
    }

    const locationPattern = locationQuery
      ? matchMode === "contains" || matchMode === "contains-rows"
        ? `%${escapeLike(locationQuery)}%`
        : `${escapeLike(locationQuery)}%`
      : null;

    if (matchMode === "contains") {
      let query = supabase.from("stock_flat").select(field);
      if (locationPattern) query = query.ilike(field, locationPattern);
      if (area) query = query.eq("area", area);

      const { data, error } = await query
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

    let query = supabase
      .from("stock_flat")
      .select("id, location, pallet_id, area, item, size, qty, stock_check, needs_label");

    if (locationQuery && matchMode === "exact") {
      query = query.ilike(field, exactIlike(locationQuery));
    } else if (locationPattern) {
      query = query.ilike(field, locationPattern);
    }
    if (area) query = query.eq("area", area);

    const { data, error } = await query
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
