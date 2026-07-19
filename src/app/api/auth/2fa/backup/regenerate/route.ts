import { getSessionUser } from "@/lib/auth/session";
import {
  decryptSecret,
  generateBackupCodes,
  getMemoryTotp,
  hashBackupCode,
  memoryTotpStore,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { isMemoryMode } from "@/lib/data/memory-store";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(6).max(12),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  let secretEnc: string | null = null;
  let totpEnabled = false;
  if (memory) {
    const row = getMemoryTotp(user.id);
    totpEnabled = row.totpEnabled;
    secretEnc = row.totpSecretEnc;
  } else {
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    totpEnabled = Boolean(row?.totpEnabled);
    secretEnc = row?.totpSecretEnc ?? null;
  }

  if (!totpEnabled || !secretEnc) {
    return NextResponse.json({ error: "2fa_not_enabled" }, { status: 400 });
  }

  let secret: string;
  try {
    secret = decryptSecret(secretEnc);
  } catch {
    return NextResponse.json({ error: "invalid_secret" }, { status: 400 });
  }

  if (!verifyTotpCode(secret, body.data.code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  const backupCodes = generateBackupCodes();
  const backupHashes = JSON.stringify(backupCodes.map(hashBackupCode));

  if (memory) {
    const row = getMemoryTotp(user.id);
    row.backupCodesHash = backupHashes;
    memoryTotpStore().set(user.id, row);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { backupCodesHash: backupHashes },
    });
  }

  return NextResponse.json({
    ok: true,
    backupCodes,
    message: "Previous backup codes are invalid. Store these securely.",
  });
}
