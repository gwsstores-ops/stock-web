import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    const { data: updated, error } = await supabaseAdmin().rpc("relocate_pallet", {
      p_value: location,
      p_new_location: newLocation
    });

    if (error) throw new Error(error.message);
    if (!updated) {
      return NextResponse.json(
        { error: "No matching stock rows were found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: `Updated ${updated} row(s)`
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Relocate failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
