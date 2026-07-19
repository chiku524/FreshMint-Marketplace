import { getSessionUser } from "@/lib/auth/session";
import {
  encryptSecret,
  generateTotpSecret,
  getMemoryTotp,
  memoryTotpStore,
} from "@/lib/auth/totp";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { isMemoryMode } from "@/lib/data/memory-store";
import { NextResponse } from "next/server";
import QRCode from "qrcode";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.totpEnabled) {
    return NextResponse.json({ error: "already_enabled" }, { status: 400 });
  }

  const { secretBase32, otpauthUrl } = generateTotpSecret(user.displayName);
  const secretEnc = encryptSecret(secretBase32);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    margin: 1,
    width: 220,
    color: { dark: "#0a1210", light: "#e8ebe6" },
  });

  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  if (memory) {
    const row = getMemoryTotp(user.id);
    row.pendingSecretEnc = secretEnc;
    memoryTotpStore().set(user.id, row);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecretEnc: secretEnc,
        // stay disabled until confirm
        totpEnabled: false,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    otpauthUrl,
    qrDataUrl,
    // Show secret once for manual entry
    secret: secretBase32,
  });
}
