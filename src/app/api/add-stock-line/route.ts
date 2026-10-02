import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const {
      area,
      location,
      palletId,
      cat,
      item,
      size,
      diamValue,
      diamDisplay,
      lengthValue,
      lengthDisplay,
      qty,
      note,
      code
    } = await req.json();

    if (!area || !location || !cat || !item || !size || diamValue === undefined || qty === undefined) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const { data: lineId, error } = await supabaseAdmin().rpc("add_stock_line", {
      p_area: area,
      p_location: location,
      p_pallet_id: palletId || null,
      p_cat: cat,
      p_item: item,
      p_size: size,
      p_diam_value: diamValue,
      p_diam_display: diamDisplay,
      p_length_value: lengthValue ?? null,
      p_length_display: lengthDisplay ?? null,
      p_qty: qty,
      p_note: note || null,
      p_code: code || null
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Line added", id: lineId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Add line failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
