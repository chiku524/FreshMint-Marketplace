import { getSessionUser } from "@/lib/auth/session";
import {
  canModerate,
  decideAppeal,
  listModerationQueue,
  resolveReport,
  settleNominationForModerator,
} from "@/lib/marketplace/moderation";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !canModerate(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const queue = await listModerationQueue();
  return NextResponse.json(queue);
}

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("report"),
    reportId: z.string(),
    action: z.enum(["dismiss", "uphold"]),
    note: z.string().optional(),
  }),
  z.object({
    kind: z.literal("appeal"),
    appealId: z.string(),
    status: z.enum(["approved", "rejected"]),
    note: z.string().optional(),
  }),
  z.object({
    kind: z.literal("nomination"),
    nominationId: z.string(),
    outcome: z.enum(["success", "abuse"]),
  }),
]);

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canModerate(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (body.data.kind === "report") {
    const result = await resolveReport({
      actorId: user.id,
      reportId: body.data.reportId,
      action: body.data.action,
      note: body.data.note,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 404 });
  }

  if (body.data.kind === "nomination") {
    const result = await settleNominationForModerator({
      nominationId: body.data.nominationId,
      outcome: body.data.outcome,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  const result = await decideAppeal({
    actorId: user.id,
    appealId: body.data.appealId,
    status: body.data.status,
    note: body.data.note,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
