import { getSessionUser } from "@/lib/auth/session";
import { storeUploadedMedia } from "@/lib/media/upload";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  try {
    const stored = await storeUploadedMedia(file);
    return NextResponse.json({ ok: true, ...stored });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
