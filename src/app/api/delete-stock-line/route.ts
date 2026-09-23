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
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data: deleted, error } = await supabaseAdmin().rpc("delete_stock_line", {
      p_id: id
    });

    if (error) throw new Error(error.message);
    if (!deleted) {
      return NextResponse.json({ error: "Stock line not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Deleted" });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
