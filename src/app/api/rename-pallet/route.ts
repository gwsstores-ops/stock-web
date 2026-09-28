import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const { id, label } = await req.json();
  const trimmed = typeof label === "string" ? label.trim() : "";

  if (!id || !trimmed) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: line, error: lineError } = await admin
    .from("stock_line")
    .select("pallet_id")
    .eq("id", id)
    .single();

  if (lineError || !line) {
    return NextResponse.json(
      { error: lineError?.message ?? "Stock line not found" },
      { status: 404 }
    );
  }

  const { data: currentPallet, error: palletError } = await admin
    .from("pallet")
    .select("id, bay_id, label")
    .eq("id", line.pallet_id)
    .single();

  if (palletError || !currentPallet) {
    return NextResponse.json(
      { error: palletError?.message ?? "Pallet not found" },
      { status: 404 }
    );
  }

  if (currentPallet.label === trimmed) {
    return NextResponse.json({ success: true });
  }

  const { count: siblingCount, error: countError } = await admin
    .from("stock_line")
    .select("id", { count: "exact", head: true })
    .eq("pallet_id", currentPallet.id)
    .neq("id", id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if (!siblingCount) {
    // This line is the only one on the pallet, so renaming it in place is safe.
    const { error } = await admin
      .from("pallet")
      .update({ label: trimmed })
      .eq("id", currentPallet.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // Other lines still share this pallet, so detach this line onto its own
  // pallet row instead of renaming the shared one out from under them.
  // If a pallet with that label already exists in the bay, join it there.
  const { data: existingTarget, error: existingError } = await admin
    .from("pallet")
    .select("id")
    .eq("bay_id", currentPallet.bay_id)
    .eq("label", trimmed)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  let targetPalletId = existingTarget?.id as number | undefined;

  if (!targetPalletId) {
    const { data: newPallet, error: insertError } = await admin
      .from("pallet")
      .insert({ bay_id: currentPallet.bay_id, label: trimmed })
      .select("id")
      .single();

    if (insertError || !newPallet) {
      return NextResponse.json(
        { error: insertError?.message ?? "Could not create pallet" },
        { status: 500 }
      );
    }

    targetPalletId = newPallet.id;
  }

  const { error: moveError } = await admin
    .from("stock_line")
    .update({ pallet_id: targetPalletId })
    .eq("id", id);

  if (moveError) {
    return NextResponse.json({ error: moveError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
