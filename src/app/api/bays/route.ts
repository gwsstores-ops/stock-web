import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escapeLike } from "@/lib/exactMatch";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area");
    const q = (searchParams.get("q") ?? "").trim();

    if (!area || !q) {
      return NextResponse.json({ labels: [] });
    }

    const { data, error } = await supabase
      .from("bay")
      .select("label")
      .eq("area", area)
      .ilike("label", `${escapeLike(q)}%`)
      .limit(300);

    if (error) throw error;

    const labels = data
      .map((row) => row.label as string)
      .sort(collator.compare)
      .slice(0, 20);

    return NextResponse.json({ labels });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Bay lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
