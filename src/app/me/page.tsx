import { PuzzleRail } from "@/components/PuzzleRail";
import { ResumeCryptoPurchaseButton } from "@/components/ResumeCryptoPurchaseButton";
import { TxExplorerLink } from "@/components/TxExplorerLink";
import { WalletNftCard } from "@/components/WalletNftCard";
import { WithdrawCollectedButton } from "@/components/WithdrawCollectedButton";
import { WorkCard } from "@/components/WorkCard";
import { getSessionUser } from "@/lib/auth/session";
import { getNetwork, isNetworkId } from "@/lib/chains/registry";
import { formatBoingBalanceUserMessage } from "@/lib/onchain/boing";
import { diagnoseRisingEligibility } from "@/lib/discovery";
import { creatorLifecycleHint, purchaseIsOpenCheckout } from "@/lib/marketplace/lifecycle";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import {
  findListingsByWalletNfts,
  getUserAssetProfile,
  listBoingNftScanCandidates,
  profileFromSession,
} from "@/lib/marketplace/profile";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import {
  fetchLinkedWalletNfts,
  matchWalletNftsToListings,
  mergeWalletHeldListings,
  walletNftsNotOnMarketplace,
  type LinkedWalletScanMeta,
} from "@/lib/wallet/inventory";
import Link from "next/link";
import { ResaleListButton } from "@/components/ResaleListButton";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function shortBoingAddress(address: string): string {
  if (address.length < 18) return address;
  return `${address.slice(0, 10)}…${address.slice(-6)}`;
}

export default async function MeCollectionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/me");

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
                <li key={bal.address} className="me-list__row" style={{ fontFamily: "monospace" }}>
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
                <Link href={`/listings/${item.listing.id}`}>{item.listing.title}</Link>
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

      <section className="me-section">
        <h2 className="display me-section__title">
          Created ({profile.created.length})
        </h2>
        {profile.created.length === 0 ? (
          <p className="fm-empty-copy">
            Nothing created yet. <Link href="/create">Soft-launch a work</Link>.
          </p>
        ) : (
          <PuzzleRail>
            {profile.created.map((listing) => (
              <WorkCard
                key={listing.id}
                listing={listing}
                showActions
                sold={soldIds.has(listing.id)}
                trackImpression={false}
                canStageRising
                footer={creatorLifecycleHint(
                  listing,
                  soldIds.has(listing.id),
                  creator
                    ? diagnoseRisingEligibility(
                        listing,
                        creator,
                        engine.state.listings.values(),
                      )
                    : null,
                )}
              />
            ))}
          </PuzzleRail>
        )}
      </section>

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
                <Link href={`/listings/${sale.listing.id}`}>{sale.listing.title}</Link>
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

      <section className="me-section">
        <h2 className="display me-section__title">
          Collected ({collected.length})
        </h2>
        {collected.length === 0 ? (
          <p className="fm-empty-copy">
            No purchases yet. Browse the <Link href="/open">Open Lane</Link>.
          </p>
        ) : (
          <PuzzleRail>
            {collected.map((item) => (
              <WorkCard
                key={item.purchaseId}
                listing={item.listing}
                bucket="sold"
                showActions={false}
                trackImpression={false}
                footer={
                  "fromWallet" in item && item.fromWallet ? (
                    <>Held in a linked wallet</>
                  ) : (
                    <>
                      Collected {new Date(item.purchasedAt).toLocaleDateString()} · $
                      {item.amountUsd}
                      {item.txHash ? (
                        <>
                          {" · "}
                          <TxExplorerLink
                            hash={item.txHash}
                            chain={item.listing.chain}
                            network={item.listing.network}
                          />
                        </>
                      ) : null}
                      <span style={{ display: "block", marginTop: "0.35rem" }}>
                        {"status" in item &&
                        (item.status === "pending_payment" ||
                          item.status === "pending_transfer") ? (
                          <ResumeCryptoPurchaseButton
                            purchaseId={item.purchaseId}
                            chain={item.listing.chain}
                            network={item.listing.network}
                            status={String(item.status)}
                          />
                        ) : (
                          <WithdrawCollectedButton
                            purchaseId={item.purchaseId}
                            chain={item.listing.chain}
                            network={item.listing.network}
                            withdrawn={Boolean(
                              "withdrawnAt" in item && item.withdrawnAt,
                            )}
                            withdrawTxHash={
                              "withdrawTxHash" in item
                                ? item.withdrawTxHash ?? null
                                : null
                            }
                            cryptoOwned={Boolean(
                              "payNetwork" in item &&
                                item.payNetwork &&
                                (!("status" in item) ||
                                  item.status === "completed"),
                            )}
                          />
                        )}
                        {"status" in item &&
                        item.status === "completed" &&
                        !("fromWallet" in item && item.fromWallet) ? (
                          <span
                            style={{ display: "block", marginTop: "0.35rem" }}
                          >
                            <ResaleListButton
                              purchaseId={item.purchaseId}
                              defaultPriceUsd={
                                "amountUsd" in item
                                  ? Number(item.amountUsd)
                                  : null
                              }
                            />
                          </span>
                        ) : null}
                      </span>
                    </>
                  )
                }
              />
            ))}
          </PuzzleRail>
        )}
      </section>

      <section className="me-section">
        <h2 className="display me-section__title">
          In wallet ({inWallet.length})
        </h2>
        {profile.wallets.length === 0 ? (
          <p className="fm-empty-copy">
            Link a wallet in <Link href="/me/settings">Settings</Link> to pull
            on-chain NFTs into this collection.
          </p>
        ) : inWallet.length === 0 ? (
          <p className="fm-empty-copy">
            {hasBoingWallet
              ? "No other FreshMint-known Boing NFTs found in linked wallets yet (or RPC was unreachable)."
              : "No other NFTs found in linked wallets yet."}
          </p>
        ) : (
          <PuzzleRail>
            {inWallet.map((nft) => (
              <WalletNftCard key={`${nft.networkLabel}:${nft.id}`} nft={nft} />
            ))}
          </PuzzleRail>
        )}
      </section>

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
                  {shelf.listingIds.length} works · {shelf.followerCount} followers ·{" "}
                  <Link href="/shelves">View shelves</Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                <li key={b.id} className="me-list__row" style={{ color: "var(--ink-muted)" }}>
                  {b.amount} · {from} → {to} · {b.status} ·{" "}
                  {new Date(b.createdAt).toLocaleString()}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
