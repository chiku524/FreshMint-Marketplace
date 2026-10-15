import { getSessionUser } from "@/lib/auth/session";
import { cancelListingForSale } from "@/lib/marketplace/listing-manage";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const result = await cancelListingForSale({
    listingId: id,
    actorId: user.id,
  });
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
