import { getSessionUser } from "@/lib/auth/session";
import { markAllNotificationsRead } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await markAllNotificationsRead({ userId: user.id });
  return NextResponse.json(result);
}
