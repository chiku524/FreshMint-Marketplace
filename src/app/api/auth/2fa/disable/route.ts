import { getSessionUser } from "@/lib/auth/session";
import {
  decryptSecret,
  getMemoryTotp,
  memoryTotpStore,
  verifyBackupCode,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { isMemoryMode } from "@/lib/data/memory-store";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(6).max(32),
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
  let backupCodesHash: string | null = null;
  let totpEnabled = false;

  if (memory) {
    const row = getMemoryTotp(user.id);
    totpEnabled = row.totpEnabled;
    secretEnc = row.totpSecretEnc;
    backupCodesHash = row.backupCodesHash;
  } else {
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    totpEnabled = Boolean(row?.totpEnabled);
    secretEnc = row?.totpSecretEnc ?? null;
    backupCodesHash = row?.backupCodesHash ?? null;
  }

  if (!totpEnabled || !secretEnc) {
    return NextResponse.json({ error: "2fa_not_enabled" }, { status: 400 });
  }

  let ok = false;
  const code = body.data.code.trim();
  try {
    if (/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
      ok = verifyTotpCode(decryptSecret(secretEnc), code);
    }
  } catch {
    ok = false;
  }
  if (!ok) {
    const backup = verifyBackupCode(code, backupCodesHash);
    ok = backup.ok;
  }
  if (!ok) {
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  if (memory) {
    memoryTotpStore().set(user.id, {
      totpEnabled: false,
      totpSecretEnc: null,
      backupCodesHash: null,
      pendingSecretEnc: null,
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: false,
        totpSecretEnc: null,
        totpVerifiedAt: null,
        backupCodesHash: null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
