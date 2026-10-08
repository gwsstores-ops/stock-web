import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";
import { applyMixPlan, buildMixPlan } from "@/lib/mixLocations";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const admin = supabaseAdmin();
    // Re-derived server-side from the current data, not taken from the client,
    // so the applied plan always matches what's actually in the database.
    const plan = await buildMixPlan(admin);
    const result = await applyMixPlan(admin, plan);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Apply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
