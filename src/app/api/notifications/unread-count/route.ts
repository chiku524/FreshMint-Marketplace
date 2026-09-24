import { getSessionUser } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const count = await countUnreadNotifications(user.id);
  return NextResponse.json({ ok: true, count });
}
