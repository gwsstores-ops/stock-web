import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("container_tracking")
    .select(
      "container, supplier_ref, origin_port, origin_date, dest_port, eta, last_location, last_status, last_status_date, batch_at"
    )
    .order("supplier_ref", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  return NextResponse.json({
    rows: rows.map((row) => ({
      container: row.container as string,
      supplierRef: (row.supplier_ref as string | null) ?? "",
      originPort: (row.origin_port as string | null) ?? "",
      originDate: (row.origin_date as string | null) ?? "",
      destPort: row.dest_port as string,
      eta: (row.eta as string | null) ?? "",
      lastLocation: (row.last_location as string | null) ?? "",
      lastStatus: (row.last_status as string | null) ?? "",
      lastStatusDate: (row.last_status_date as string | null) ?? ""
    })),
    lastUpdated: rows[0]?.batch_at ?? null
  });
}
