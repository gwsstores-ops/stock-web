import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isPrintAgent } from "@/lib/printAgentAuth";

// The print agent reports back after sending a job to the printer.
export async function POST(req: Request) {
  if (!isPrintAgent(req)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id, ok, error: printError } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("print_job")
    .update(
      ok
        ? { status: "printed", printed_at: new Date().toISOString(), pdf: null, error: null }
        : { status: "failed", error: String(printError || "Print failed") }
    )
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
