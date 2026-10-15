import { getSessionUser } from "@/lib/auth/session";
import {
  findListingsByWalletNfts,
  getUserAssetProfile,
  listBoingNftScanCandidates,
} from "@/lib/marketplace/profile";
import {
  fetchLinkedWalletNfts,
  matchWalletNftsToListings,
  mergeWalletHeldListings,
  walletNftsNotOnMarketplace,
  type LinkedWalletScanMeta,
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
  const boingCandidates = await listBoingNftScanCandidates();
  const scanMeta: LinkedWalletScanMeta = {
    warnings: [],
    boingBalances: [],
  };
  const scanned = await fetchLinkedWalletNfts(
    profile.wallets,
    [...catalog, ...boingCandidates],
    { meta: scanMeta },
  );
  const extraListings = await findListingsByWalletNfts(scanned);
  const walletNfts = matchWalletNftsToListings(scanned, [
    ...catalog,
    ...extraListings,
    ...boingCandidates,
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
    boingBalances: scanMeta.boingBalances,
    warnings: scanMeta.warnings,
    /** MVP: Boing NFT results are FreshMint-known listings only. */
    boingNftScan: {
      mode: "freshmint_known_tokens",
      candidateCount: boingCandidates.length,
    },
  });
}
