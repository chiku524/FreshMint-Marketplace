import { absoluteAppUrl, safeNextPath } from "@/lib/auth/paths";
import { clearSessionCookie, destroySession } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  await destroySession();
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
}

export async function GET(req: NextRequest) {
  await destroySession();
  const next = safeNextPath(req.nextUrl.searchParams.get("next") ?? "/sign-in");
  const res = NextResponse.redirect(absoluteAppUrl(next, req.url));
  return clearSessionCookie(res);
}
