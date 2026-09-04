import { getSessionUser } from "@/lib/auth/session";
import {
  findListingsByWalletNfts,
  getUserAssetProfile,
} from "@/lib/marketplace/profile";
import {
  fetchLinkedWalletNfts,
  matchWalletNftsToListings,
  mergeWalletHeldListings,
  walletNftsNotOnMarketplace,
} from "@/lib/wallet/inventory";
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
  const catalog = [
    ...profile.created,
    ...profile.owned.map((item) => item.listing),
  ];
  const scanned = await fetchLinkedWalletNfts(profile.wallets, catalog);
  const extraListings = await findListingsByWalletNfts(scanned);
  const walletNfts = matchWalletNftsToListings(scanned, [
    ...catalog,
    ...extraListings,
  ]);
  const collected = mergeWalletHeldListings(
    profile.owned,
    profile.created,
    walletNfts,
    extraListings,
  );
  return NextResponse.json({
    ok: true,
    profile: {
      ...profile,
      owned: collected,
      walletNfts: walletNftsNotOnMarketplace(
        walletNfts,
        profile.created,
        collected,
      ),
    },
  });
}
