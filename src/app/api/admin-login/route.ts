import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, isCorrectAdminPassword, issueAdminToken } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const { password } = await req.json();

  if (!(await isCorrectAdminPassword(password))) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await issueAdminToken();
  const res = NextResponse.json({ ok: true });

  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return res;
}
