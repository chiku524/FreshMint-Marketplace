import { limitByUserOrIp } from "@/lib/http/rate-limit";
import { getSessionUser } from "@/lib/auth/session";
import { reserveCollectionMedia } from "@/lib/marketplace/service";
import { classifyMediaUploadError } from "@/lib/media/upload-errors";
import { storeUploadedMedia } from "@/lib/media/upload";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = await limitByUserOrIp(req, user.id, "media-upload", 60, 10 * 60_000);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  const collectionId = String(form.get("collectionId") ?? "").trim();

  try {
    const stored = await storeUploadedMedia(file);
    if (collectionId) {
      const reserved = await reserveCollectionMedia({
        collectionId,
        creatorId: user.id,
        size: stored.size,
      });
      if (!reserved.ok) {
        return NextResponse.json({ error: reserved.error }, { status: 400 });
      }
    }
    return NextResponse.json({
      ok: true,
      ...stored,
      collectionId: collectionId || null,
    });
  } catch (e) {
    const classified = classifyMediaUploadError(e);
    return NextResponse.json(
      { error: classified.code, retryable: classified.retryable },
      { status: classified.status },
    );
  }
}
