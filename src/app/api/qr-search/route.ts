import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";

type SearchRow = {
  id: number;
  location: string;
  area: string;
  item: string;
  size: string;
  qty: number | null;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim();

    if (!code) {
      return NextResponse.json(
        { error: "Missing code" },
        { status: 400 }
      );
    }

    const { data, error } = await fetchAllPages<SearchRow>((from, to) =>
      supabase
        .from("stock")
        .select("id, location, area, item, size, qty")
        .eq("code", code)
        .in("area", ["GWS", "W3", "W4"])
        .order("location", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({ rows: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "QR search failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
