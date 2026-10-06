import { MeCollectionBrowser } from "@/components/MeCollectionBrowser";
import { ResumeCryptoPurchaseButton } from "@/components/ResumeCryptoPurchaseButton";
import { getSessionUser } from "@/lib/auth/session";
import { getNetwork, isNetworkId } from "@/lib/chains/registry";
import { diagnoseRisingEligibility } from "@/lib/discovery";
import {
  creatorLifecycleHint,
  purchaseIsOpenCheckout,
} from "@/lib/marketplace/lifecycle";
import {
  findListingsByWalletNfts,
  getUserAssetProfile,
  listBoingNftScanCandidates,
  profileFromSession,
} from "@/lib/marketplace/profile";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { formatBoingBalanceUserMessage } from "@/lib/onchain/boing";
import {
  PROFILE_VIEW_COOKIE,
  resolveProfileView,
} from "@/lib/profile-view";
import {
  fetchLinkedWalletNfts,
  matchWalletNftsToListings,
  mergeWalletHeldListings,
  walletNftsNotOnMarketplace,
  type LinkedWalletScanMeta,
} from "@/lib/wallet/inventory";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function shortBoingAddress(address: string): string {
  if (address.length < 18) return address;
  return `${address.slice(0, 10)}…${address.slice(-6)}`;
}

export default async function MeCollectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/me");

  const sp = await searchParams;
  const viewQuery = typeof sp.view === "string" ? sp.view : null;
  const viewCookie = (await cookies()).get(PROFILE_VIEW_COOKIE)?.value;
  const initialView = resolveProfileView(viewQuery, viewCookie);

  const profile =
    (await getUserAssetProfile(user.id)) ?? profileFromSession(user);
  const soldIds = await listClosedPrimarySaleIds();
  const engine = await getDiscoveryEngine();
  const creator = engine.state.creators.get(user.id);

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
    { meta: scanMeta, skipCache: false },
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
  const inWallet = walletNftsNotOnMarketplace(
    walletNfts,
    profile.created,
    collected,
  );
  const openCheckouts = profile.owned.filter((item) =>
    purchaseIsOpenCheckout(item.status),
  );
  const liveSales = (profile.sales ?? []).filter(
    (sale) => sale.status === "completed" || purchaseIsOpenCheckout(sale.status),
  );
  const hasBoingWallet = profile.wallets.some((w) => w.chain === "boing");

  const created = profile.created.map((listing) => ({
    listing,
    sold: soldIds.has(listing.id),
    footer: creatorLifecycleHint(
      listing,
      soldIds.has(listing.id),
      creator
        ? diagnoseRisingEligibility(
            listing,
            creator,
            engine.state.listings.values(),
          )
        : null,
    ),
  }));

  const collectedItems = collected.map((item) => ({
    purchaseId: item.purchaseId,
    listing: item.listing,
    purchasedAt: item.purchasedAt,
    amountUsd: item.amountUsd,
    txHash: item.txHash ?? null,
    fromWallet: "fromWallet" in item ? Boolean(item.fromWallet) : false,
    status: "status" in item ? item.status : undefined,
    withdrawnAt:
      "withdrawnAt" in item ? (item.withdrawnAt ?? null) : null,
    withdrawTxHash:
      "withdrawTxHash" in item ? (item.withdrawTxHash ?? null) : null,
    payNetwork: "payNetwork" in item ? (item.payNetwork ?? null) : null,
  }));

  return (
    <>
      <p className="me-section__lead">
        Works you created, collected, hold in a linked wallet, curated, and
        bridged.
      </p>

      {hasBoingWallet ? (
        <section className="me-notice" data-testid="boing-wallet-balances">
          <h2 className="display me-section__title">Boing balance</h2>
          <p className="me-section__lead">
            Live native BOING from linked Boing wallets. NFT scan covers
            FreshMint-known Boing tokens only (not a full chain indexer).
          </p>
          {scanMeta.boingBalances.length === 0 ? (
            <p className="fm-empty-copy">No usable Boing wallet address linked.</p>
          ) : (
            <ul className="me-list">
              {scanMeta.boingBalances.map((bal) => (
                <li
                  key={bal.address}
                  className="me-list__row"
                  style={{ fontFamily: "monospace" }}
                >
                  {bal.ok ? (
                    <>
                      <a
                        href={getNetwork("boing").explorerAddress(bal.address)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortBoingAddress(bal.address)}
                      </a>
                      {" · "}
                      <strong style={{ fontFamily: "inherit" }}>
                        {bal.balance ?? "0"} BOING
                      </strong>
                    </>
                  ) : (
                    <>
                      <a
                        href={getNetwork("boing").explorerAddress(bal.address)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortBoingAddress(bal.address)}
                      </a>
                      {" · "}
                      <span style={{ color: "var(--ink-muted)" }}>
                        balance not loaded
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {scanMeta.boingBalances.some((b) => !b.ok) ? (
            <p className="fm-form-note" data-testid="boing-scan-warnings">
              {formatBoingBalanceUserMessage(
                scanMeta.boingBalances.find((b) => !b.ok)?.error,
              )}{" "}
              NFT scan still covers FreshMint-known Boing tokens only.
            </p>
          ) : scanMeta.warnings.length > 0 ? (
            <p className="fm-form-note" data-testid="boing-scan-warnings">
              {scanMeta.warnings.join(" ")}
            </p>
          ) : null}
        </section>
      ) : null}

      {openCheckouts.length > 0 ? (
        <section className="me-notice">
          <h2 className="display me-section__title">Finish checkout</h2>
          <p className="me-section__lead">
            An unpaid checkout reserves a 1/1 for 15 minutes. Finish the wallet
            steps or cancel to release it.
          </p>
          <ul className="me-list">
            {openCheckouts.map((item) => (
              <li key={item.purchaseId} className="me-list__row">
                <Link href={`/listings/${item.listing.id}`}>
                  {item.listing.title}
                </Link>
                {" · "}
                {item.status === "pending_payment" ? "payment" : "transfer"}
                <span style={{ display: "block", marginTop: "0.35rem" }}>
                  <ResumeCryptoPurchaseButton
                    purchaseId={item.purchaseId}
                    chain={item.listing.chain}
                    network={item.listing.network}
                    status={String(item.status)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MeCollectionBrowser
        initialView={initialView}
        created={created}
        collected={collectedItems}
        inWallet={inWallet}
        hasWallets={profile.wallets.length > 0}
        hasBoingWallet={hasBoingWallet}
        sales={
          <section className="me-section">
            <h2 className="display me-section__title">
              Sales ({liveSales.length})
            </h2>
            {liveSales.length === 0 ? (
              <p className="fm-empty-copy">
                No collector checkouts yet. Soft-launch from{" "}
                <Link href="/create">Create</Link>.
              </p>
            ) : (
              <ul className="me-list">
                {liveSales.map((sale) => (
                  <li key={sale.purchaseId} className="me-list__row">
                    <Link href={`/listings/${sale.listing.id}`}>
                      {sale.listing.title}
                    </Link>
                    {" · $"}
                    {sale.amountUsd}
                    {sale.sellerNetUsd != null
                      ? ` · net $${sale.sellerNetUsd.toFixed(2)}`
                      : ""}
                    {" · "}
                    {sale.status === "completed"
                      ? "sold"
                      : sale.status === "pending_transfer"
                        ? "paid, transferring"
                        : "checkout in progress"}
                  </li>
                ))}
              </ul>
            )}
          </section>
        }
        shelves={
          <section className="me-section">
            <h2 className="display me-section__title">
              Shelves ({profile.shelves.length})
            </h2>
            {profile.shelves.length === 0 ? (
              <p className="fm-empty-copy">
                No shelves yet. Curate from <Link href="/studio">Studio</Link>.
              </p>
            ) : (
              <ul className="me-list">
                {profile.shelves.map((shelf) => (
                  <li key={shelf.id} className="me-list__row">
                    <div className="display" style={{ fontSize: "1.05rem" }}>
                      {shelf.name}
                    </div>
                    <p className="fm-form-note" style={{ marginTop: "0.25rem" }}>
                      {shelf.listingIds.length} works · {shelf.followerCount}{" "}
                      followers · <Link href="/shelves">View shelves</Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        }
        bridges={
          <section className="me-section">
            <h2 className="display me-section__title">Recent bridges</h2>
            {profile.bridges.length === 0 ? (
              <p className="fm-empty-copy">
                No bridge transfers yet. <Link href="/bridge">Move funds</Link>.
              </p>
            ) : (
              <ul className="me-list">
                {profile.bridges.map((b) => {
                  const from = isNetworkId(b.fromNetwork)
                    ? getNetwork(b.fromNetwork).label
                    : b.fromNetwork;
                  const to = isNetworkId(b.toNetwork)
                    ? getNetwork(b.toNetwork).label
                    : b.toNetwork;
                  return (
                    <li
                      key={b.id}
                      className="me-list__row"
                      style={{ color: "var(--ink-muted)" }}
                    >
                      {b.amount} · {from} → {to} · {b.status} ·{" "}
                      {new Date(b.createdAt).toLocaleString()}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        }
      />
    </>
  );
}
