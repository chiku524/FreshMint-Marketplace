import { limitByUserOrIp } from "@/lib/http/rate-limit";
import { getSessionUser } from "@/lib/auth/session";
import {
  releaseCollectionMedia,
  reserveCollectionMedia,
} from "@/lib/marketplace/service";
import { classifyMediaUploadError } from "@/lib/media/upload-errors";
import { persistPreparedMedia, prepareUploadedMedia } from "@/lib/media/upload";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // 10k-item collections must be uploadable in one sitting: 3000 files per
  // 10 min (~5/s) is abuse protection, not a collection-size limit.
  const limited = await limitByUserOrIp(req, user.id, "media-upload", 3000, 10 * 60_000);
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
    // Validate + hash first, check quota, and only then write to Blob — a
    // rejected file never leaves an orphaned blob behind.
    const prepared = await prepareUploadedMedia(file);
    let reservedNew = false;
    if (collectionId) {
      const reserved = await reserveCollectionMedia({
        collectionId,
        creatorId: user.id,
        size: prepared.bytes.length,
        mediaHash: prepared.mediaHash,
      });
      if (!reserved.ok) {
        return NextResponse.json({ error: reserved.error }, { status: 400 });
      }
      reservedNew = !reserved.duplicate;
    }
    let stored;
    try {
      stored = await persistPreparedMedia(prepared);
    } catch (e) {
      if (collectionId && reservedNew) {
        await releaseCollectionMedia({ collectionId, mediaHash: prepared.mediaHash }).catch(() => {});
      }
      throw e;
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
