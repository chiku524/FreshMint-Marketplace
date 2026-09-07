import { HowItWorksNote } from "@/components/HowItWorksNote";
import { PuzzleRail } from "@/components/PuzzleRail";
import { ResumeCryptoPurchaseButton } from "@/components/ResumeCryptoPurchaseButton";
import { TxExplorerLink } from "@/components/TxExplorerLink";
import { WalletNftCard } from "@/components/WalletNftCard";
import { WithdrawCollectedButton } from "@/components/WithdrawCollectedButton";
import { WorkCard } from "@/components/WorkCard";
import { getSessionUser } from "@/lib/auth/session";
import { getNetwork, isNetworkId } from "@/lib/chains/registry";
import { creatorLifecycleHint, purchaseIsOpenCheckout } from "@/lib/marketplace/lifecycle";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import {
  findListingsByWalletNfts,
  getUserAssetProfile,
  profileFromSession,
} from "@/lib/marketplace/profile";
import {
  fetchLinkedWalletNfts,
  matchWalletNftsToListings,
  mergeWalletHeldListings,
  walletNftsNotOnMarketplace,
} from "@/lib/wallet/inventory";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MeCollectionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/me");

  const profile =
    (await getUserAssetProfile(user.id)) ?? profileFromSession(user);
  const soldIds = await listClosedPrimarySaleIds();

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

  return (
    <>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 0.75rem", maxWidth: "52ch" }}>
        Works you created, collected, hold in a linked wallet, curated, and
        bridged.
      </p>
      <HowItWorksNote kind="collect" />

      {openCheckouts.length > 0 ? (
        <section
          style={{
            marginBottom: "1.75rem",
            border: "1px solid var(--line)",
            padding: "0.9rem 1rem",
            background: "var(--panel)",
          }}
        >
          <h2 className="display" style={{ margin: "0 0 0.4rem", fontSize: "1.15rem" }}>
            Finish checkout
          </h2>
          <p style={{ margin: "0 0 0.75rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            An unpaid checkout reserves a 1/1 for 15 minutes. Finish the wallet
            steps or cancel to release it.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
            {openCheckouts.map((item) => (
              <li key={item.purchaseId}>
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

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Created ({profile.created.length})
        </h2>
        {profile.created.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
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
                footer={creatorLifecycleHint(listing, soldIds.has(listing.id))}
              />
            ))}
          </PuzzleRail>
        )}
      </section>

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Sales ({liveSales.length})
        </h2>
        {liveSales.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No collector checkouts yet. Soft-launch from{" "}
            <Link href="/create">Create</Link>.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
            {liveSales.map((sale) => (
              <li
                key={sale.purchaseId}
                style={{
                  border: "1px solid var(--line)",
                  padding: "0.75rem 0.9rem",
                  fontSize: "0.9rem",
                }}
              >
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

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Collected ({collected.length})
        </h2>
        {collected.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
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
                      </span>
                    </>
                  )
                }
              />
            ))}
          </PuzzleRail>
        )}
      </section>

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          In wallet ({inWallet.length})
        </h2>
        {profile.wallets.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            Link a wallet in <Link href="/me/settings">Settings</Link> to pull
            on-chain NFTs into this collection.
          </p>
        ) : inWallet.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No other NFTs found in linked wallets yet.
          </p>
        ) : (
          <PuzzleRail>
            {inWallet.map((nft) => (
              <WalletNftCard key={`${nft.networkLabel}:${nft.id}`} nft={nft} />
            ))}
          </PuzzleRail>
        )}
      </section>

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Shelves ({profile.shelves.length})
        </h2>
        {profile.shelves.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No shelves yet. Curate from <Link href="/studio">Studio</Link>.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {profile.shelves.map((shelf) => (
              <div
                key={shelf.id}
                style={{
                  border: "1px solid var(--line)",
                  padding: "0.9rem 1rem",
                  background: "var(--panel)",
                }}
              >
                <div className="display" style={{ fontSize: "1.15rem" }}>
                  {shelf.name}
                </div>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    color: "var(--ink-muted)",
                    fontSize: "0.9rem",
                  }}
                >
                  {shelf.listingIds.length} works · {shelf.followerCount} followers ·{" "}
                  <Link href="/shelves">View shelves</Link>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Recent bridges
        </h2>
        {profile.bridges.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No bridge transfers yet. <Link href="/bridge">Move funds</Link>.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
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
                  style={{
                    border: "1px solid var(--line)",
                    padding: "0.75rem 0.9rem",
                    color: "var(--ink-muted)",
                    fontSize: "0.9rem",
                  }}
                >
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
