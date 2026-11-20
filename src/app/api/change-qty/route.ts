import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";

// Sets a stock line's quantity (Stock Check's editable Qty column).
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id, qty } = await req.json();

  if (!id || !Number.isInteger(qty) || qty < 0) {
    return NextResponse.json({ error: "Quantity must be a whole number, 0 or more" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("stock_line")
    .update({ qty })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
