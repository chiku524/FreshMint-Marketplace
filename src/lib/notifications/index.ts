/**
 * In-app notifications (no email). Idempotent via (userId, dedupeKey).
 */
import { prisma } from "@/lib/db";

export const NOTIFICATION_TYPES = [
  "english_win",
  "english_outbid",
  "english_cascade",
  "english_expired",
  "creator_english_awaiting",
  "creator_english_sold",
  "creator_english_unsold",
  "item_sold",
  "package_sold",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationRow = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  payloadJson: string;
  href: string | null;
  dedupeKey: string;
  readAt: number | null;
  createdAt: number;
};

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType | string;
  title: string;
  body?: string;
  href?: string | null;
  dedupeKey: string;
  payload?: Record<string, unknown>;
  now?: number;
};

export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ created: boolean; notification: NotificationRow | null }> {
  const now = input.now ?? Date.now();
  const payloadJson = JSON.stringify(input.payload ?? {});
  const body = input.body ?? "";
  const href = input.href ?? null;

  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, upsertMemoryNotification, getMemoryNotificationByDedupe } =
    await import("@/lib/data/memory-store");
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    const existing = getMemoryNotificationByDedupe(input.userId, input.dedupeKey);
    if (existing) {
      return { created: false, notification: existing };
    }
    const row = upsertMemoryNotification({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body,
      payloadJson,
      href,
      dedupeKey: input.dedupeKey,
      createdAt: now,
    });
    return { created: true, notification: row };
  }

  try {
    const created = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body,
        payloadJson,
        href,
        dedupeKey: input.dedupeKey,
      },
    });
    return {
      created: true,
      notification: {
        id: created.id,
        userId: created.userId,
        type: created.type,
        title: created.title,
        body: created.body,
        payloadJson: created.payloadJson,
        href: created.href,
        dedupeKey: created.dedupeKey,
        readAt: created.readAt?.getTime() ?? null,
        createdAt: created.createdAt.getTime(),
      },
    };
  } catch (err) {
    // Unique violation → idempotent hit
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "P2002") {
      const existing = await prisma.notification.findUnique({
        where: {
          userId_dedupeKey: {
            userId: input.userId,
            dedupeKey: input.dedupeKey,
          },
        },
      });
      if (existing) {
        return {
          created: false,
          notification: {
            id: existing.id,
            userId: existing.userId,
            type: existing.type,
            title: existing.title,
            body: existing.body,
            payloadJson: existing.payloadJson,
            href: existing.href,
            dedupeKey: existing.dedupeKey,
            readAt: existing.readAt?.getTime() ?? null,
            createdAt: existing.createdAt.getTime(),
          },
        };
      }
    }
    throw err;
  }
}

export async function listNotificationsForUser(input: {
  userId: string;
  limit?: number;
  cursor?: string | null;
  unreadOnly?: boolean;
}): Promise<{ items: NotificationRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, listMemoryNotifications } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();

  if (mode === "memory" || isMemoryMode()) {
    let rows = listMemoryNotifications(input.userId);
    if (input.unreadOnly) rows = rows.filter((r) => r.readAt == null);
    if (input.cursor) {
      const idx = rows.findIndex((r) => r.id === input.cursor);
      rows = idx >= 0 ? rows.slice(idx + 1) : rows;
    }
    const page = rows.slice(0, limit);
    const nextCursor =
      page.length === limit ? page[page.length - 1]!.id : null;
    return { items: page, nextCursor };
  }

  const rows = await prisma.notification.findMany({
    where: {
      userId: input.userId,
      ...(input.unreadOnly ? { readAt: null } : {}),
      ...(input.cursor
        ? {
            createdAt: {
              lt: (
                await prisma.notification.findUnique({
                  where: { id: input.cursor },
                })
              )?.createdAt,
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  // If cursor pointed at missing row, fall back without filter
  const items = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    type: r.type,
    title: r.title,
    body: r.body,
    payloadJson: r.payloadJson,
    href: r.href,
    dedupeKey: r.dedupeKey,
    readAt: r.readAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime(),
  }));
  return {
    items,
    nextCursor: items.length === limit ? items[items.length - 1]!.id : null,
  };
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, listMemoryNotifications } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    return listMemoryNotifications(userId).filter((r) => r.readAt == null).length;
  }
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markNotificationRead(input: {
  userId: string;
  notificationId: string;
  now?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = input.now ?? Date.now();
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, markMemoryNotificationRead } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const ok = markMemoryNotificationRead(
      input.userId,
      input.notificationId,
      now,
    );
    return ok ? { ok: true } : { ok: false, error: "not_found" };
  }
  const row = await prisma.notification.findFirst({
    where: { id: input.notificationId, userId: input.userId },
  });
  if (!row) return { ok: false, error: "not_found" };
  if (!row.readAt) {
    await prisma.notification.update({
      where: { id: row.id },
      data: { readAt: new Date(now) },
    });
  }
  return { ok: true };
}

export async function markAllNotificationsRead(input: {
  userId: string;
  now?: number;
}): Promise<{ ok: true; updated: number }> {
  const now = input.now ?? Date.now();
  const { ensureDatabaseReady } = await import("@/lib/db-ready");
  const { isMemoryMode, markAllMemoryNotificationsRead } = await import(
    "@/lib/data/memory-store"
  );
  const mode = await ensureDatabaseReady();
  if (mode === "memory" || isMemoryMode()) {
    const updated = markAllMemoryNotificationsRead(input.userId, now);
    return { ok: true, updated };
  }
  const result = await prisma.notification.updateMany({
    where: { userId: input.userId, readAt: null },
    data: { readAt: new Date(now) },
  });
  return { ok: true, updated: result.count };
}

/** Pure helper for tests — builds dedupe keys consistently. */
export function notificationDedupeKey(
  type: string,
  ...parts: Array<string | number | null | undefined>
): string {
  return [type, ...parts.map((p) => String(p ?? ""))].join(":");
}
