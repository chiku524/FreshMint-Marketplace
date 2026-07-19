import { getSessionUser } from "@/lib/auth/session";
import { getUserAssetProfile } from "@/lib/marketplace/profile";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const profile = await getUserAssetProfile(user.id);
  if (!profile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, profile });
}
