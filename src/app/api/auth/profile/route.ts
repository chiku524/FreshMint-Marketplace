import { AccountError, updateDisplayName } from "@/lib/auth/account";
import { getSessionUser } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  displayName: z.string().trim().min(1).max(64),
});

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    await updateDisplayName({ userId: user.id, displayName: body.data.displayName });
    return NextResponse.json({ ok: true, displayName: body.data.displayName });
  } catch (e) {
    if (e instanceof AccountError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
