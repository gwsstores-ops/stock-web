import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";

const requireAdmin = async () => {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return isValidAdminToken(token);
};

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin()
    .from("container_map")
    .select("id, container, supplier_ref, updated_at")
    .order("container", { ascending: true })
    .order("supplier_ref", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    map: (data ?? []).map((row) => ({
      id: row.id as number,
      container: row.container as string,
      supplierRef: row.supplier_ref as string,
      updatedAt: row.updated_at as string
    }))
  });
}

/** A container can carry more than one supplier ref - adding/saving one never
 * replaces another already recorded for the same container, it only
 * upserts that exact (container, supplier ref) pair. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { container, supplierRef } = await req.json();
  const cont = typeof container === "string" ? container.trim().toUpperCase() : "";
  const ref = typeof supplierRef === "string" ? supplierRef.trim() : "";

  if (!cont || !ref) {
    return NextResponse.json({ error: "Missing container or supplier ref" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("container_map")
    .upsert(
      { container: cont, supplier_ref: ref, updated_at: new Date().toISOString() },
      { onConflict: "container,supplier_ref" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Saved" });
}

/** Edits one specific mapping row (by id) - used by the inline editor, so
 * changing a supplier ref updates that row rather than adding a new one. */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id, container, supplierRef } = await req.json();
  const cont = typeof container === "string" ? container.trim().toUpperCase() : "";
  const ref = typeof supplierRef === "string" ? supplierRef.trim() : "";

  if (!id || !cont || !ref) {
    return NextResponse.json({ error: "Missing id, container or supplier ref" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("container_map")
    .update({ container: cont, supplier_ref: ref, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Saved" });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().from("container_map").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Deleted" });
}
