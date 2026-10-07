import { getSessionUser } from "@/lib/auth/session";
import {
  getFridayRaffleForUser,
  getFridayRafflePublic,
} from "@/lib/marketplace/friday-treasury-raffle";
import { TREASURY_FRIDAY_COPY } from "@/lib/marketplace/friday-treasury-copy";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public Friday raffle status + optional session eligibility. */
export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 8;
  const history = await getFridayRafflePublic({
    limit: Number.isFinite(limit) ? limit : 8,
  });
  const user = await getSessionUser(req);
  const me = user ? await getFridayRaffleForUser(user.id) : null;
  return NextResponse.json({
    ok: true,
    /** Slim eligibility string for clients that still read it; UI no longer lectures. */
    eligibility: TREASURY_FRIDAY_COPY.eligibility,
    copy: TREASURY_FRIDAY_COPY.eligibility,
    history,
    me,
  });
}
