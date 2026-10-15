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
    .select("container, supplier_ref, updated_at")
    .order("container", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    map: (data ?? []).map((row) => ({
      container: row.container as string,
      supplierRef: row.supplier_ref as string,
      updatedAt: row.updated_at as string
    }))
  });
}

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
    .upsert({ container: cont, supplier_ref: ref, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Saved" });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { container } = await req.json();
  const cont = typeof container === "string" ? container.trim().toUpperCase() : "";

  if (!cont) {
    return NextResponse.json({ error: "Missing container" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().from("container_map").delete().eq("container", cont);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Deleted" });
}
