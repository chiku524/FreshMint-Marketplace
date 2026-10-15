import { getSessionUser } from "@/lib/auth/session";
import {
  collectionSlugIssueMessage,
  validateCollectionSlugFormat,
} from "@/lib/marketplace/collection-slug";
import {
  isCollectionSlugAvailable,
  reclaimOwnUnconfirmedCollectionHold,
} from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("slug") ?? "";
  const excludeCollectionId =
    req.nextUrl.searchParams.get("excludeCollectionId")?.trim() || undefined;
  const format = validateCollectionSlugFormat(raw);
  if (!format.ok) {
    return NextResponse.json({
      ok: false,
      available: false,
      slug: null,
      issue: format.issue,
      message: collectionSlugIssueMessage(format.issue),
    });
  }

  let available = await isCollectionSlugAvailable(format.slug, {
    excludeCollectionId,
  });

  if (!available) {
    const user = await getSessionUser(req);
    if (user) {
      const reclaim = await reclaimOwnUnconfirmedCollectionHold({
        creatorId: user.id,
        slug: format.slug,
      });
      if (reclaim.released.length) {
        available = await isCollectionSlugAvailable(format.slug, {
          excludeCollectionId,
        });
      }
    }
  }

  if (!available) {
    return NextResponse.json({
      ok: false,
      available: false,
      slug: format.slug,
      issue: "taken",
      message: collectionSlugIssueMessage("taken"),
    });
  }

  return NextResponse.json({
    ok: true,
    available: true,
    slug: format.slug,
    issue: null,
    message: "Available",
  });
}
