import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_SESSION_COOKIE, isValidAdminToken } from "@/lib/adminAuth";

// Points a stock line at a different existing catalogue product (how Stock
// Check edits a line's item/size). The product must be in the line's current
// category, so this can't drift a line into an unrelated part of the catalogue.
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminToken(token))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id, productId } = await req.json();

  if (!id || !productId) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: line, error: lineError } = await admin
    .from("stock_line")
    .select("product:product_id (cat)")
    .eq("id", id)
    .single<{ product: { cat: string } | null }>();

  if (lineError || !line?.product) {
    return NextResponse.json(
      { error: lineError?.message ?? "Stock line not found" },
      { status: 404 }
    );
  }

  const { data: target, error: targetError } = await admin
    .from("product")
    .select("cat")
    .eq("id", productId)
    .single();

  if (targetError || !target) {
    return NextResponse.json(
      { error: targetError?.message ?? "Product not found" },
      { status: 404 }
    );
  }

  if (target.cat !== line.product.cat) {
    return NextResponse.json({ error: "Product is in a different category" }, { status: 400 });
  }

  const { error } = await admin
    .from("stock_line")
    .update({ product_id: productId })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
