import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { exactIlike } from "@/lib/exactMatch";

export async function POST(req: Request) {
  try {
    const { location, newLocation } = await req.json();

    if (!location || !newLocation) {
      return NextResponse.json(
        { error: "Missing data" },
        { status: 400 }
      );
    }

    // Exact pallet match, never a prefix: `E3` must not also relocate `E35`.
    const { data: rows, error: fetchError } = await supabase
      .from("stock")
      .select("id")
      .ilike("pallet_id", exactIlike(location));

    if (fetchError) throw fetchError;
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "No matching stock rows were found" },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase
      .from("stock")
      .update({ location: newLocation })
      .in("id", rows.map((row) => row.id));

    if (updateError) throw updateError;

    return NextResponse.json({
      message: `Updated ${rows.length} row(s)`
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Relocate failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
