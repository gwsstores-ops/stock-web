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
    const { palletId } = await req.json();

    if (!palletId) {
      return NextResponse.json({ error: "Missing pallet ID" }, { status: 400 });
    }

    const { data: moved, error } = await supabaseAdmin().rpc("accept_gws_in", {
      p_value: palletId,
      p_field: "pallet_id"
    });

    if (error) throw new Error(error.message);
    if (!moved) {
      return NextResponse.json({ error: "No matching GWS-IN stock found" }, { status: 404 });
    }

    return NextResponse.json({ message: `Moved ${moved} row(s) to GWS` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Move failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
