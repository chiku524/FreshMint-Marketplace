import { AccountError, attachPasswordToUser } from "@/lib/auth/account";
import { getSessionUser } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

/** Attach email + password to the signed-in profile. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    await attachPasswordToUser({
      userId: user.id,
      email: body.data.email,
      password: body.data.password,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AccountError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "attach_failed" }, { status: 500 });
  }
}
