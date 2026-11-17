import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isPrintAgent } from "@/lib/printAgentAuth";

// Called every few seconds by the print agent. Hands back the oldest waiting
// job and marks it "printing" so it is only ever printed once. 204 = nothing.
export async function POST(req: Request) {
  if (!isPrintAgent(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: oldest, error: findError } = await admin
    .from("print_job")
    .select("id")
    .eq("status", "waiting")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!oldest) {
    return new NextResponse(null, { status: 204 });
  }

  // Only claims it if it is still waiting, in case two agents ever run at once.
  const { data: job, error: claimError } = await admin
    .from("print_job")
    .update({ status: "printing" })
    .eq("id", oldest.id)
    .eq("status", "waiting")
    .select("id, name, pdf")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!job) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(job);
}
