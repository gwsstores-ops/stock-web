import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Labels are a page or two, so anything bigger is a mistake.
const MAX_PDF_BYTES = 3 * 1024 * 1024;

// Adds a label to the print queue. The body is the PDF itself, the name is
// passed in the query string, e.g. POST /api/print-jobs?name=label_415ES_04.pdf
export async function POST(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() || "label.pdf";
  const bytes = Buffer.from(await req.arrayBuffer());

  if (bytes.length === 0 || bytes.subarray(0, 5).toString() !== "%PDF-") {
    return NextResponse.json({ error: "That is not a PDF" }, { status: 400 });
  }
  if (bytes.length > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "The PDF is too big to print" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("print_job")
    .insert({ name, pdf: bytes.toString("base64") })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not queue the label" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

// Lets the page show whether its label has printed yet: GET /api/print-jobs?id=12
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("print_job")
    .select("status, error")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Print job not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
