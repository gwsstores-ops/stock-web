import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type StockRow = {
  id: number;
  location: string;
  item: string;
  size: string;
  qty: number | null;
  area: string;
};

export async function POST(req: Request) {
  try {
    const { location, target } = await req.json();

    if (!location || !target) {
      return NextResponse.json(
        { error: "Missing data" },
        { status: 400 }
      );
    }

    const newArea = target === "GWS" ? "GWS-IN" : target;

    // 1️⃣ Get rows that will be moved
    const { data: rows, error: fetchError } = await supabase
      .from("stock")
      .select("id, location, item, size, qty, area")
      .ilike("location", `${location}%`);

    if (fetchError) throw fetchError;
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "No matching stock rows were found" },
        { status: 404 }
      );
    }

    // 2️⃣ Insert audit entries (one per row)
    const logEntries = rows.map((row: StockRow) => ({
      stock_id: row.id,
      location: row.location,
      item: row.item,
      size: row.size,
      qty: row.qty,
      old_area: row.area,
      new_area: newArea
    }));

    const { error: logError } = await supabase
      .from("move_log")
      .insert(logEntries);

    if (logError) throw logError;

    // 3️⃣ Update stock table
    const { error: updateError } = await supabase
      .from("stock")
      .update({ area: newArea })
      .ilike("location", `${location}%`);

    if (updateError) throw updateError;

    return NextResponse.json({
      message: `Moved ${rows.length} row(s)`
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Move failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
