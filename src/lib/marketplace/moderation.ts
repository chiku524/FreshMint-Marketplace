import { prisma } from "@/lib/db";
import { resolveAppeal } from "@/lib/discovery/anti-spam";
import { toListing } from "@/lib/data/mappers";

export function canModerate(role: string): boolean {
  return role === "moderator" || role === "editor";
}

export function canEditFeatured(role: string): boolean {
  return role === "editor" || role === "moderator";
}

export async function listModerationQueue() {
  const [reports, appeals, delisted] = await Promise.all([
    prisma.report.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      include: {
        listing: true,
        reporter: { select: { id: true, displayName: true } },
      },
      take: 100,
    }),
    prisma.appeal.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        listing: true,
        creator: { select: { id: true, displayName: true } },
      },
      take: 100,
    }),
    prisma.listing.findMany({
      where: { delisted: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return { reports, appeals, delisted };
}

export async function resolveReport(input: {
  actorId: string;
  reportId: string;
  action: "dismiss" | "uphold";
  note?: string;
}) {
  const report = await prisma.report.findUnique({
    where: { id: input.reportId },
  });
  if (!report) return { ok: false as const, error: "not_found" };

  await prisma.report.update({
    where: { id: report.id },
    data: { resolved: true },
  });

  if (input.action === "uphold") {
    await prisma.listing.update({
      where: { id: report.listingId },
      data: { delisted: true },
    });
  }

  await prisma.moderationAction.create({
    data: {
      actorId: input.actorId,
      targetType: "report",
      targetId: report.id,
      action: input.action === "uphold" ? "resolve_report" : "resolve_report",
      note: `${input.action}${input.note ? `: ${input.note}` : ""}`,
    },
  });

  return { ok: true as const };
}

export async function decideAppeal(input: {
  actorId: string;
  appealId: string;
  status: "approved" | "rejected";
  note?: string;
}) {
  const appeal = await prisma.appeal.findUnique({
    where: { id: input.appealId },
  });
  if (!appeal) return { ok: false as const, error: "not_found" };
  const listing = await prisma.listing.findUnique({
    where: { id: appeal.listingId },
  });
  if (!listing) return { ok: false as const, error: "listing_missing" };

  const resolved = resolveAppeal(
    toListing(listing),
    {
      id: appeal.id,
      listingId: appeal.listingId,
      creatorId: appeal.creatorId,
      message: appeal.message,
      createdAt: appeal.createdAt.getTime(),
      status: "pending",
    },
    input.status,
  );

  await prisma.appeal.update({
    where: { id: appeal.id },
    data: { status: input.status },
  });
  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      delisted: resolved.listing.delisted,
      appealStatus: input.status,
      reportRate: resolved.listing.signals.reportRate,
    },
  });
  await prisma.moderationAction.create({
    data: {
      actorId: input.actorId,
      targetType: "appeal",
      targetId: appeal.id,
      action: input.status === "approved" ? "approve_appeal" : "reject_appeal",
      note: input.note ?? "",
    },
  });

  return { ok: true as const, listing: resolved.listing };
}

export async function submitListingAppeal(input: {
  listingId: string;
  creatorId: string;
  message: string;
}) {
  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
  });
  if (!listing) return { ok: false as const, error: "not_found" };
  if (listing.creatorId !== input.creatorId) {
    return { ok: false as const, error: "forbidden" };
  }
  if (!listing.delisted) return { ok: false as const, error: "not_delisted" };

  const appeal = await prisma.appeal.create({
    data: {
      listingId: input.listingId,
      creatorId: input.creatorId,
      message: input.message,
      status: "pending",
    },
  });
  await prisma.listing.update({
    where: { id: listing.id },
    data: { appealStatus: "pending" },
  });
  return { ok: true as const, appeal };
}
