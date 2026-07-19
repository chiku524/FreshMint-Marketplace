import { createSession } from "@/lib/auth/session";
import {
  decryptSecret,
  getMemoryTotp,
  memoryTotpStore,
  readPending2faToken,
  verifyBackupCode,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { prisma } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db-ready";
import { isMemoryMode } from "@/lib/data/memory-store";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  pendingToken: z.string().min(20),
  code: z.string().min(6).max(32),
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const pending = await readPending2faToken(body.data.pendingToken);
  if (!pending) {
    return NextResponse.json({ error: "pending_expired" }, { status: 401 });
  }

  const mode = await ensureDatabaseReady();
  const memory = mode === "memory" || isMemoryMode();

  let totpEnabled = false;
  let secretEnc: string | null = null;
  let backupCodesHash: string | null = null;
  let displayName = pending.userId;
  let wallets: { chain: string; address: string }[] = [];
  let curatorScore = 0;

  if (memory) {
    const { getMemoryState } = await import("@/lib/data/memory-store");
    const creator = getMemoryState().creators.get(pending.userId);
    if (!creator) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    displayName = creator.displayName;
    wallets = creator.wallets;
    curatorScore = creator.curatorScore;
    const totp = getMemoryTotp(pending.userId);
    totpEnabled = totp.totpEnabled;
    secretEnc = totp.totpSecretEnc;
    backupCodesHash = totp.backupCodesHash;
  } else {
    const user = await prisma.user.findUnique({
      where: { id: pending.userId },
      include: { wallets: true },
    });
    if (!user) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    displayName = user.displayName;
    wallets = user.wallets;
    curatorScore = user.curatorScore;
    totpEnabled = user.totpEnabled;
    secretEnc = user.totpSecretEnc;
    backupCodesHash = user.backupCodesHash;
  }

  if (!totpEnabled || !secretEnc) {
    return NextResponse.json({ error: "2fa_not_enabled" }, { status: 400 });
  }

  let ok = false;
  const code = body.data.code.trim();

  try {
    const secret = decryptSecret(secretEnc);
    if (/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
      ok = verifyTotpCode(secret, code);
    }
  } catch {
    ok = false;
  }

  if (!ok) {
    const backup = verifyBackupCode(code, backupCodesHash);
    if (backup.ok) {
      ok = true;
      if (memory) {
        const row = getMemoryTotp(pending.userId);
        row.backupCodesHash = backup.remainingHashesJson ?? "[]";
        memoryTotpStore().set(pending.userId, row);
      } else {
        await prisma.user.update({
          where: { id: pending.userId },
          data: { backupCodesHash: backup.remainingHashesJson ?? "[]" },
        });
      }
    }
  }

  if (!ok) {
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  await createSession(pending.userId);
  return NextResponse.json({
    ok: true,
    user: {
      id: pending.userId,
      displayName,
      wallets,
      curatorScore,
      totpEnabled: true,
    },
  });
}
