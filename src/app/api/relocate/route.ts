import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { location, newLocation } = await req.json();

    if (!location || !newLocation) {
      return NextResponse.json(
        { error: "Missing data" },
        { status: 400 }
      );
    }

    const { data: rows, error: fetchError } = await supabase
      .from("stock")
      .select("id")
      .ilike("pallet_id", `${location}%`);

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
      .ilike("pallet_id", `${location}%`);

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
