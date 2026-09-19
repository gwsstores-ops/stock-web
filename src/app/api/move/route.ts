import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { location, target, field } = await req.json();
    const matchField = field === "location" ? "location" : "pallet_id";

    if (!location || !target) {
      return NextResponse.json(
        { error: "Missing data" },
        { status: 400 }
      );
    }

    // One atomic database call: logs to move_log and moves the pallet (exact match).
    const { data: moved, error } = await supabaseAdmin().rpc("move_pallet", {
      p_value: location,
      p_target: target,
      p_field: matchField
    });

    if (error) throw new Error(error.message);
    if (!moved) {
      return NextResponse.json(
        { error: "No matching stock rows were found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: `Moved ${moved} row(s)`
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Move failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
