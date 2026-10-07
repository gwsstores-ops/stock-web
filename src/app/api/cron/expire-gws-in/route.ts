import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Called daily by Vercel Cron (see vercel.json). Vercel sends
// `Authorization: Bearer ${CRON_SECRET}` automatically once CRON_SECRET is set
// as a project env var, so this just has to check it matches.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { data: cleared, error } = await supabaseAdmin().rpc("delete_expired_gws_in");

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: `Cleared ${cleared ?? 0} expired GWS-IN line(s)` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Cleanup failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
