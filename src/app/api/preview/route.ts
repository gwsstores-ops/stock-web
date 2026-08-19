import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { splitStockLocation } from "@/lib/stockLocation";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const locationQuery = searchParams.get("location");
    const palletIdQuery = searchParams.get("palletId")?.trim();
    const matchMode = searchParams.get("match");

    if (!locationQuery && !palletIdQuery) {
      return NextResponse.json(
        { error: "Missing pallet ID" },
        { status: 400 }
      );
    }

    const searchQuery = palletIdQuery || locationQuery || "";

    const locationPattern =
      matchMode === "contains" ? `%${searchQuery}%` : `${searchQuery}%`;

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

    if (palletIdQuery) {
      const { data, error } = await supabase
        .from("stock")
        .select("id, location, area, item, size, qty, stock_check")
        .ilike("location", `%${palletIdQuery}%`)
        .order("location", { ascending: true });

      if (error) throw error;

      const normalizedPalletId = palletIdQuery.toUpperCase();
      const rows = data.filter(
        (row) =>
          splitStockLocation(row.location).palletId.toUpperCase() ===
          normalizedPalletId
      );

      return NextResponse.json({ rows });
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
