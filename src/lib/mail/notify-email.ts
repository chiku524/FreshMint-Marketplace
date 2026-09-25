import { sendMail } from "@/lib/mail/resend";
import {
  englishExpiredEmail,
  englishWinEmail,
} from "@/lib/mail/templates";

async function emailForUser(userId: string): Promise<string | null> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode } = await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const { getMemoryAccount } = await import("@/lib/auth/account");
    return getMemoryAccount(userId)?.email ?? null;
  }
  const { prisma } = await import("@/lib/db");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email ?? null;
}

/** Send win/cascade/expired emails only when notification was newly created. */
export async function maybeEmailEnglishWin(input: {
  created: boolean;
  winnerId: string;
  listingId: string;
  listingTitle?: string;
  purchaseId: string;
  amountUsd: number;
  deadlineAt: number;
  cascaded?: boolean;
  dedupeKey: string;
}) {
  if (!input.created) return;
  const to = await emailForUser(input.winnerId);
  if (!to) return;
  let deadlineLabel: string;
  try {
    deadlineLabel = new Date(input.deadlineAt).toLocaleString();
  } catch {
    deadlineLabel = "soon";
  }
  const tpl = englishWinEmail({
    listingTitle: input.listingTitle ?? "listing",
    amountUsd: input.amountUsd,
    deadlineLabel,
    href: `/listings/${input.listingId}`,
    cascaded: input.cascaded,
  });
  await sendMail({
    to,
    ...tpl,
    idempotencyKey: `mail:${input.dedupeKey}`,
  });
}

export async function maybeEmailEnglishExpired(input: {
  created: boolean;
  winnerId: string;
  listingId: string;
  listingTitle?: string;
  purchaseId: string;
  amountUsd: number;
  dedupeKey: string;
}) {
  if (!input.created) return;
  const to = await emailForUser(input.winnerId);
  if (!to) return;
  const tpl = englishExpiredEmail({
    listingTitle: input.listingTitle ?? "listing",
    amountUsd: input.amountUsd,
    href: `/listings/${input.listingId}`,
  });
  await sendMail({
    to,
    ...tpl,
    idempotencyKey: `mail:${input.dedupeKey}`,
  });
}
