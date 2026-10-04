import {
  collectionSlugIssueMessage,
  validateCollectionSlugFormat,
} from "@/lib/marketplace/collection-slug";
import { isCollectionSlugAvailable } from "@/lib/marketplace/service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("slug") ?? "";
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

  const available = await isCollectionSlugAvailable(format.slug);
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
