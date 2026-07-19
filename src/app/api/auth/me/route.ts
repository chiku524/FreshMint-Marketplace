import { getSessionUser } from "@/lib/auth/session";
import { isEmergingCreator } from "@/lib/discovery";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });

  const emerging = isEmergingCreator({
    id: user.id,
    displayName: user.displayName,
    wallets: user.wallets.map((w) => ({
      chain: w.chain as "evm" | "solana",
      address: w.address,
    })),
    firstListingAt: user.firstListingAt?.getTime() ?? null,
    lifetimePrimaryVolumeUsd: user.lifetimePrimaryVolumeUsd,
    completedSales: user.completedSales,
    flagged: user.flagged,
    washCluster: user.washCluster,
    verifiedCreator: user.verifiedCreator,
    walletCreatedAt: user.walletCreatedAt.getTime(),
    risingEntriesThisWeek: user.risingEntriesThisWeek,
    openLaneListingsToday: user.openLaneListingsToday,
    curatorScore: user.curatorScore,
    establishedBadge: user.establishedBadge,
  });

  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      wallets: user.wallets,
      curatorScore: user.curatorScore,
      verifiedCreator: user.verifiedCreator,
      role: user.role,
      emerging: emerging.emerging,
      emergingReasons: emerging.reasons,
      totpEnabled: user.totpEnabled,
    },
  });
}
