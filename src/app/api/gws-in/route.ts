import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";

type GwsInRow = {
  id: number;
  location: string | null;
  pallet_id: string | null;
  item: string;
  size: string;
  qty: number | null;
  gws_in_since: string | null;
};

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { data, error } = await fetchAllPages<GwsInRow>((from, to) =>
      supabase
        .from("stock_flat")
        .select("id, location, pallet_id, item, size, qty, gws_in_since")
        .eq("area", "GWS-IN")
        .order("location", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to)
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({ rows: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Load failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
