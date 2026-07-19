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
  if (memory) {
    secretEnc = getMemoryTotp(user.id).pendingSecretEnc ?? getMemoryTotp(user.id).totpSecretEnc;
  } else {
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    secretEnc = row?.totpSecretEnc ?? null;
  }

  if (!secretEnc) {
    return NextResponse.json({ error: "enroll_required" }, { status: 400 });
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
    row.totpEnabled = true;
    row.totpSecretEnc = secretEnc;
    row.pendingSecretEnc = null;
    row.backupCodesHash = backupHashes;
    memoryTotpStore().set(user.id, row);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: true,
        totpSecretEnc: secretEnc,
        totpVerifiedAt: new Date(),
        backupCodesHash: backupHashes,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    backupCodes,
    message: "Store these backup codes securely. They will not be shown again.",
  });
}
