import { z } from "zod";
import { invalidBody, readJsonBody } from "@/lib/http/json";
import { getSessionUser } from "@/lib/auth/session";
import {
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl;
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const cursor = url.searchParams.get("cursor");
  const unreadOnly = url.searchParams.get("unreadOnly") === "1";
  const result = await listNotificationsForUser({
    userId: user.id,
    limit: Number.isFinite(limit) ? limit : 20,
    cursor,
    unreadOnly,
  });
  return NextResponse.json({
    ok: true,
    ...result,
  });
}

const patchSchema = z.object({
  markAllRead: z.boolean().optional(),
  id: z.string().min(1).max(128).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = patchSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidBody(parsed.error);
  const body = parsed.data;
  if (body?.markAllRead) {
    const result = await markAllNotificationsRead({ userId: user.id });
    return NextResponse.json(result);
  }
  if (body?.id) {
    const result = await markNotificationRead({
      userId: user.id,
      notificationId: body.id,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "invalid_body" }, { status: 400 });
}
