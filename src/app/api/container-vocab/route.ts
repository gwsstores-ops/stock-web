import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePaging";
import { cached } from "@/lib/routeCache";

/**
 * The category and item names already in use, so a correction made while
 * checking a container matches the names the stock list searches on.
 */
export async function GET() {
  const { data, error } = await cached("container-vocab", 300_000, () =>
    fetchAllPages<{ cat: string | null; item: string | null }>((from, to) =>
      supabase
        .from("product")
        .select("cat, item")
        .not("cat", "is", null)
        .not("item", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
    )
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const itemsByCat: Record<string, string[]> = {};
  const seen = new Set<string>();

  for (const row of data ?? []) {
    if (!row.cat || !row.item) continue;

    const key = `${row.cat}|${row.item}`;
    if (seen.has(key)) continue;
    seen.add(key);

    (itemsByCat[row.cat] ??= []).push(row.item);
  }

  for (const items of Object.values(itemsByCat)) {
    items.sort();
  }

  return NextResponse.json({
    cats: Object.keys(itemsByCat).sort(),
    itemsByCat
  });
}
