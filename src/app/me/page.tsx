import { MeCollectionBrowser } from "@/components/MeCollectionBrowser";
import { ResumeCryptoPurchaseButton } from "@/components/ResumeCryptoPurchaseButton";
import { getSessionUser } from "@/lib/auth/session";
import { getNetwork, isNetworkId } from "@/lib/chains/registry";
import { aggregateCollectionVolumesUsd } from "@/lib/marketplace/collections-browse";
import { purchaseIsOpenCheckout } from "@/lib/marketplace/lifecycle";
import {
  buildCreatorProfileCollections,
  countUnpublishedOwnedCollections,
} from "@/lib/marketplace/profile-collections";
import {
  getUserAssetProfile,
  profileFromSession,
} from "@/lib/marketplace/profile";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { formatBoingBalanceUserMessage } from "@/lib/onchain/boing";
import {
  PROFILE_VIEW_COOKIE,
  resolveProfileView,
} from "@/lib/profile-view";
import {
  fetchBoingBalancesForWallets,
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
  const engine = await getDiscoveryEngine();
  const volumes = await aggregateCollectionVolumesUsd();
  const allListings = [...engine.state.listings.values()];
  const ownedCollections = [...engine.state.collections.values()].filter(
    (c) => c.creatorId === user.id,
  );

  const collections = buildCreatorProfileCollections({
    collections: ownedCollections,
    listings: allListings,
    volumes,
  });
  const unpublishedCount = countUnpublishedOwnedCollections({
    collections: ownedCollections,
    listings: allListings,
    creatorId: user.id,
  });

  const openCheckouts = profile.owned.filter((item) =>
    purchaseIsOpenCheckout(item.status),
  );
  const liveSales = (profile.sales ?? []).filter(
    (sale) => sale.status === "completed" || purchaseIsOpenCheckout(sale.status),
  );
  const hasBoingWallet = profile.wallets.some((w) => w.chain === "boing");

  const scanMeta: LinkedWalletScanMeta = {
    warnings: [],
    boingBalances: [],
  };
  if (hasBoingWallet) {
    scanMeta.boingBalances = await fetchBoingBalancesForWallets(
      profile.wallets,
    );
  }

  return (
    <>
      <p className="me-section__lead">
        Your minted collections, sales, shelves, and bridges. Open a collection
        to browse or manage pieces.
      </p>

      {hasBoingWallet ? (
        <section className="me-notice" data-testid="boing-wallet-balances">
          <h2 className="display me-section__title">Boing balance</h2>
          <p className="me-section__lead">
            Live native BOING from linked Boing wallets.
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
              )}
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

      {unpublishedCount > 0 ? (
        <section className="me-notice">
          <h2 className="display me-section__title">Finish publishing</h2>
          <p className="me-section__lead">
            {unpublishedCount} collection
            {unpublishedCount === 1 ? "" : "s"} still need mint or soft-launch
            before they appear here.{" "}
            <Link href="/studio">Open Studio</Link>
            {" · "}
            <Link href="/create">Create</Link>
            {" · "}
            <Link href={`/creators/${user.id}`}>Public profile</Link>
          </p>
        </section>
      ) : null}

      <MeCollectionBrowser
        initialView={initialView}
        creatorName={profile.displayName}
        collections={collections}
        emptyCollections={
          <p className="fm-empty-copy">
            No minted collections yet.{" "}
            <Link href="/create">Publish a collection</Link>
            {" · "}
            <Link href="/studio">Studio</Link>.
          </p>
        }
        trailing={
          <>
            <section className="me-section">
              <h2 className="display me-section__title">
                Sales ({liveSales.length})
              </h2>
              {liveSales.length === 0 ? (
                <p className="fm-empty-copy">
                  No collector checkouts yet. Soft-launch from{" "}
                  <Link href="/studio">Studio</Link> or{" "}
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

            <section className="me-section">
              <h2 className="display me-section__title">
                Shelves ({profile.shelves.length})
              </h2>
              {profile.shelves.length === 0 ? (
                <p className="fm-empty-copy">
                  No shelves yet. Curate from{" "}
                  <Link href="/studio">Studio</Link>.
                </p>
              ) : (
                <ul className="me-list">
                  {profile.shelves.map((shelf) => (
                    <li key={shelf.id} className="me-list__row">
                      <div className="display" style={{ fontSize: "1.05rem" }}>
                        {shelf.name}
                      </div>
                      <p
                        className="fm-form-note"
                        style={{ marginTop: "0.25rem" }}
                      >
                        {shelf.listingIds.length} works · {shelf.followerCount}{" "}
                        followers · <Link href="/shelves">View shelves</Link>
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
                  No bridge transfers yet.{" "}
                  <Link href="/bridge">Move funds</Link>.
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
          </>
        }
      />
    </>
  );
}
