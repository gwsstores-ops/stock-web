import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";
import type { TrackingRow } from "@/lib/containers/tracking";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (value: unknown) =>
  typeof value === "string" && DATE_RE.test(value) ? value : null;
const asText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export async function POST(req: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { rows } = (await req.json()) as { rows?: Partial<TrackingRow>[] };

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Missing rows" }, { status: 400 });
  }

  const clean = rows
    .map((row) => ({
      container: (row.container ?? "").trim().toUpperCase(),
      supplierRef: (row.supplierRef ?? "").trim(),
      originPort: asText(row.originPort),
      originDate: asDate(row.originDate),
      destPort: asText(row.destPort) ?? "Cork, Ireland",
      eta: asDate(row.eta),
      lastLocation: asText(row.lastLocation),
      lastStatus: asText(row.lastStatus),
      lastStatusDate: asDate(row.lastStatusDate)
    }))
    .filter((row) => row.container);

  if (!clean.length) {
    return NextResponse.json({ error: "No containers to save" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const mappings = clean
    .filter((row) => row.supplierRef)
    .map((row) => ({
      container: row.container,
      supplier_ref: row.supplierRef,
      updated_at: new Date().toISOString()
    }));

  if (mappings.length) {
    const { error: mapError } = await admin.from("container_map").upsert(mappings);
    if (mapError) {
      return NextResponse.json({ error: mapError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await admin
    .from("container_tracking")
    .delete()
    .not("id", "is", null);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await admin.from("container_tracking").insert(
    clean.map((row) => ({
      container: row.container,
      supplier_ref: row.supplierRef || null,
      origin_port: row.originPort,
      origin_date: row.originDate,
      dest_port: row.destPort,
      eta: row.eta,
      last_location: row.lastLocation,
      last_status: row.lastStatus,
      last_status_date: row.lastStatusDate
    }))
  );

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ message: `Saved ${clean.length} container(s)` });
}
