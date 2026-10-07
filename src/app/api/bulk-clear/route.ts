import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { escapeLike } from "@/lib/exactMatch";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { area, prefix } = await req.json();

    if (!area) {
      return NextResponse.json({ error: "Missing area" }, { status: 400 });
    }

    const { data: deleted, error } = await supabaseAdmin().rpc("bulk_clear_stock", {
      p_area: area,
      p_location_prefix: escapeLike((prefix ?? "").trim())
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: `Deleted ${deleted ?? 0} stock line(s)` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Bulk clear failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
