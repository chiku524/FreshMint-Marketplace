import { getSessionUser } from "@/lib/auth/session";
import {
  collectionTitleIssueMessage,
  validateCollectionTitleFormat,
} from "@/lib/marketplace/collection-title";
import {
  isCollectionTitleAvailable,
  reclaimOwnUnconfirmedCollectionHold,
} from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("title") ?? "";
  const excludeCollectionId =
    req.nextUrl.searchParams.get("excludeCollectionId")?.trim() || undefined;
  const format = validateCollectionTitleFormat(raw);
  if (!format.ok) {
    return NextResponse.json({
      ok: false,
      available: false,
      title: null,
      normalized: null,
      issue: format.issue,
      message: collectionTitleIssueMessage(format.issue),
    });
  }

  let available = await isCollectionTitleAvailable(format.title, {
    excludeCollectionId,
  });

  // Heal: signed-in creator's own failed/cancelled deploy soft-hold.
  if (!available) {
    const user = await getSessionUser(req);
    if (user) {
      const reclaim = await reclaimOwnUnconfirmedCollectionHold({
        creatorId: user.id,
        title: format.title,
      });
      if (reclaim.released.length) {
        available = await isCollectionTitleAvailable(format.title, {
          excludeCollectionId,
        });
      }
    }
  }

  if (!available) {
    return NextResponse.json({
      ok: false,
      available: false,
      title: format.title,
      normalized: format.normalized,
      issue: "taken",
      message: collectionTitleIssueMessage("taken"),
    });
  }

  return NextResponse.json({
    ok: true,
    available: true,
    title: format.title,
    normalized: format.normalized,
    issue: null,
    message: "Available",
  });
}
