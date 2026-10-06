import { FollowButton } from "@/components/FollowButton";
import { BidPanel } from "@/components/BidPanel";
import { ListingActions } from "@/components/ListingActions";
import { ManageListingPanel } from "@/components/ManageListingPanel";
import { OfferPanel } from "@/components/OfferPanel";
import { ResaleListButton } from "@/components/ResaleListButton";
import { TreasuryFridayNote } from "@/components/TreasuryFridayNote";
import {
  dutchCurrentPriceUsd,
  minNextBidUsd,
  resolveSaleMode,
  saleModeBadge,
} from "@/lib/marketplace/sale-mode";
import { PageViewTracker } from "@/components/PageViewTracker";
import { TxExplorerLink } from "@/components/TxExplorerLink";
import { getNetwork, resolveNetwork } from "@/lib/chains/registry";
import { isEmergingListing } from "@/lib/discovery";
import { getSessionUser } from "@/lib/auth/session";
import { dropWindowFor, primarySupplyCap } from "@/lib/marketplace/drops";
import { canUserStageListing, stageLabel } from "@/lib/marketplace/lifecycle";
import {
  canManageListing,
  findBuyerCompletedPurchase,
  hasActiveSecondaryForOrigin,
  listingHasPublicSurface,
  listingSellerId,
} from "@/lib/marketplace/listing-manage";
import { findBuyerOpenPurchase, listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { lazySettleEnglishAuction } from "@/lib/marketplace/english-auction";
import { collectionHref } from "@/lib/marketplace/collection-slug";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { listingPageMetadata } from "@/lib/seo/site";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const engine = await getDiscoveryEngine();
  const listing = engine.state.listings.get(id);
  return listingPageMetadata(listing ?? null);
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const engine = await getDiscoveryEngine();
  const listing = engine.state.listings.get(id);
  if (!listing) notFound();

  const creator = engine.state.creators.get(listing.creatorId);
  const collection = listing.collectionId
    ? engine.state.collections.get(listing.collectionId)
    : null;
  const emerging = creator
    ? isEmergingListing(listing, creator).emerging
    : false;
  const user = await getSessionUser();
  const isManager = canManageListing(user?.id, listing);
  // Drafts stay creator/seller-private. Cancelled listings with artwork/mint
  // keep a stable public NFT page (not-for-sale) instead of 404.
  if (listing.stage === "draft" && !isManager) {
    notFound();
  }
  if (listing.delisted && !listingHasPublicSurface(listing) && !isManager) {
    notFound();
  }
  // Cron-less English settle on view: award high bidder with pending purchase
  // (or mark unsold when reserve fails) before sold/pending lookups.
  const englishSettle = await lazySettleEnglishAuction(listing.id);

  const soldIds = await listClosedPrimarySaleIds();
  const isSold = soldIds.has(listing.id);
  const pendingPurchase = user
    ? await findBuyerOpenPurchase(listing.id, user.id)
    : null;
  const completedPurchase =
    user && isSold && !listing.isSecondary
      ? await findBuyerCompletedPurchase(listing.id, user.id)
      : null;
  const collectorCanList =
    completedPurchase != null &&
    !(await hasActiveSecondaryForOrigin(listing.id));
  const following =
    user != null &&
    (engine.state.follows.get(user.id)?.followedArtistIds.includes(
      listing.creatorId,
    ) ??
      false);
  const sellerId = listingSellerId(listing);

  const hue = [...listing.id].reduce((h, c) => (h + c.charCodeAt(0) * 17) % 360, 0);
  const media = listing.mediaUrl;
  const network = resolveNetwork(listing.network, listing.chain);
  const net = getNetwork(network);
  const minted = Boolean(
    listing.tokenId && listing.contractAddress && listing.mintTxHash,
  );
  const drop = dropWindowFor(listing, collection);
  const saleMode = resolveSaleMode(listing);
  const now = Date.now();
  const auctionLive =
    saleMode !== "fixed" &&
    listing.auctionStartsAt != null &&
    listing.auctionEndsAt != null &&
    now >= listing.auctionStartsAt &&
    now <= listing.auctionEndsAt;
  const auctionEnded =
    saleMode !== "fixed" &&
    listing.auctionEndsAt != null &&
    now > listing.auctionEndsAt;
  const minBid = minNextBidUsd({
    startingBidUsd: listing.startingBidUsd,
    priceUsd: listing.priceUsd,
    currentHighBidUsd: listing.currentHighBidUsd,
  });
  const reserveMet =
    !listing.reserveUsd ||
    (listing.currentHighBidUsd != null &&
      listing.currentHighBidUsd >= listing.reserveUsd);

  const cap = primarySupplyCap(listing);
  const englishAwardAmount =
    saleMode === "english" && englishSettle.outcome.status === "award"
      ? englishSettle.outcome.amountUsd
      : saleMode === "english" && auctionEnded && reserveMet && listing.currentHighBidUsd
        ? listing.currentHighBidUsd
        : null;
  const englishAwardBidderId =
    saleMode === "english" && englishSettle.outcome.status === "award"
      ? englishSettle.outcome.highBidderId
      : listing.highBidderId;

  const explorerToken =
    listing.contractAddress && listing.tokenId && net.explorerToken
      ? net.explorerToken(listing.contractAddress, listing.tokenId)
      : listing.contractAddress
        ? net.explorerAddress(listing.contractAddress)
        : null;

  const mediaStyle = media
    ? {
        backgroundImage: `url(${media})`,
        backgroundSize: "cover" as const,
        backgroundPosition: "center" as const,
      }
    : {
        background: `
          linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
          linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), var(--bg-deep))
        `,
      };

  return (
    <div className="page-wrap">
      <PageViewTracker listingId={listing.id} />
      <p className="page-crumb">
        <Link href="/open">Open Lane</Link>
        {" · "}
        <Link href={`/creators/${listing.creatorId}`}>
          {creator?.displayName ?? "Creator"}
        </Link>
      </p>

      <div className="listing-detail-grid">
        <div className="work-media listing-detail__media" style={mediaStyle} />

        <div>
          <div className="listing-detail__badges">
            {emerging ? <span className="badge emerging">Emerging</span> : null}
            {minted ? <span className="badge emerging">Minted</span> : null}
            <span className="badge">{net.label}</span>
            <span className="badge">{saleModeBadge(listing)}</span>
            <span className="badge">{stageLabel(listing.stage)}</span>
            {cap != null ? (
              <span className="badge">
                {cap === 1 ? "1/1" : `Limited ${cap}`}
              </span>
            ) : listing.type === "open_edition" ? (
              <span className="badge">Open edition</span>
            ) : null}
            {drop.state === "upcoming" ? (
              <span className="badge emerging">Drop scheduled</span>
            ) : null}
            {drop.state === "live" ? (
              <span className="badge emerging">Drop live</span>
            ) : null}
            {drop.state === "ended" ? <span className="badge">Drop ended</span> : null}
          </div>
          <h1 className="display listing-detail__title">{listing.title}</h1>
          <p className="listing-detail__byline">
            by{" "}
            <Link href={`/creators/${listing.creatorId}`}>
              {creator?.displayName ?? listing.creatorId}
            </Link>
            {listing.priceUsd != null || saleMode === "dutch"
              ? ` · $${
                  saleMode === "dutch"
                    ? (dutchCurrentPriceUsd({
                        startingBidUsd: listing.startingBidUsd,
                        priceUsd: listing.priceUsd,
                        reserveUsd: listing.reserveUsd,
                        auctionStartsAt: listing.auctionStartsAt,
                        auctionEndsAt: listing.auctionEndsAt,
                      }) ?? listing.priceUsd ?? "—")
                    : listing.priceUsd
                }`
              : " · timed listing"}
            {" · "}
            {listing.medium}
            {collection ? (
              <>
                {" · "}
                <Link href={collectionHref(collection)}>{collection.title}</Link>
              </>
            ) : null}
          </p>
          <p className="listing-detail__desc">
            {listing.description || "No description yet."}
          </p>
          {!listing.delisted && (saleMode === "fixed" || saleMode === "timed_window") ? (
            <TreasuryFridayNote
              surface="listing"
              className="listing-detail__note"
            />
          ) : null}
          {minted || listing.tokenId ? (
            <p className="listing-detail__chain">
              {listing.tokenId ? (
                <span>
                  Token {listing.tokenId}
                  {listing.contractAddress
                    ? ` · ${listing.contractAddress.slice(0, 8)}…`
                    : ""}
                </span>
              ) : null}
              {listing.mintTxHash ? (
                <span style={{ display: "block", marginTop: "0.35rem" }}>
                  <TxExplorerLink
                    hash={listing.mintTxHash}
                    chain={listing.chain}
                    network={listing.network}
                    label="View mint tx"
                  />
                  {explorerToken ? (
                    <>
                      {" · "}
                      <a href={explorerToken} target="_blank" rel="noreferrer">
                        Token ↗
                      </a>
                    </>
                  ) : null}
                </span>
              ) : explorerToken ? (
                <span style={{ display: "block", marginTop: "0.35rem" }}>
                  <a href={explorerToken} target="_blank" rel="noreferrer">
                    Explorer ↗
                  </a>
                </span>
              ) : null}
            </p>
          ) : null}
          {listing.styleTags.length > 0 ? (
            <p className="listing-detail__tags">
              {listing.styleTags.map((t) => (
                <span key={t} className="badge">
                  {t}
                </span>
              ))}
            </p>
          ) : null}
          {listing.traits && listing.traits.length > 0 ? (
            <dl className="nft-traits">
              {listing.traits.map((trait) => (
                <div key={`${trait.trait_type}-${trait.value}`}>
                  <dt>{trait.trait_type}</dt>
                  <dd>{trait.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="listing-detail__follow">
            <FollowButton
              artistId={listing.creatorId}
              initiallyFollowing={following}
              label="Follow creator"
            />
          </div>
          {listing.type === "auction" && saleMode === "timed_window" ? (
            <p className="listing-detail__note">
              Timed listing
              {drop.state === "upcoming"
                ? " (not started)"
                : drop.state === "live"
                  ? " (live now)"
                  : drop.state === "ended"
                    ? " (ended)"
                    : ""}
              . Buy now at the list price while the window is open.
            </p>
          ) : null}
          {saleMode === "dutch" ? (
            <p className="listing-detail__note">
              Dutch auction
              {drop.state === "upcoming"
                ? " (not started)"
                : drop.state === "live"
                  ? " (live — price declining)"
                  : drop.state === "ended"
                    ? " (ended)"
                    : ""}
              . Buy now at the current price before it hits the floor.
            </p>
          ) : null}

          {listing.delisted ? (
            <p className="listing-detail__note listing-detail__note--unlisted">
              Not listed for sale.
            </p>
          ) : null}

          <div className="listing-detail__buyer-rail">
            {saleMode === "english" && !listing.delisted ? (
              <BidPanel
                listingId={listing.id}
                minBidUsd={minBid}
                live={auctionLive}
                ended={Boolean(auctionEnded)}
                isHighBidder={user?.id === englishAwardBidderId}
                winningBidUsd={englishAwardAmount ?? listing.currentHighBidUsd}
                reserveMet={Boolean(reserveMet)}
                isCreator={user?.id === listing.creatorId}
                claimPurchaseId={
                  user?.id === englishAwardBidderId
                    ? pendingPurchase?.id ?? englishSettle.purchaseId
                    : null
                }
              />
            ) : null}

            {!listing.delisted ? (
              <ListingActions
                listingId={listing.id}
                creatorId={listing.creatorId}
                priceUsd={
                  englishAwardAmount != null
                    ? englishAwardAmount
                    : saleMode === "dutch"
                      ? dutchCurrentPriceUsd({
                          startingBidUsd: listing.startingBidUsd,
                          priceUsd: listing.priceUsd,
                          reserveUsd: listing.reserveUsd,
                          auctionStartsAt: listing.auctionStartsAt,
                          auctionEndsAt: listing.auctionEndsAt,
                        })
                      : listing.priceUsd
                }
                stage={listing.stage}
                sold={
                  (isSold && !pendingPurchase) ||
                  (saleMode === "english" &&
                    (englishSettle.settleLabel === "unsold" ||
                      englishSettle.settleLabel === "payment_expired_unsold" ||
                      (Boolean(auctionEnded) && !reserveMet))) ||
                  (saleMode === "english" &&
                    Boolean(auctionEnded) &&
                    englishAwardAmount != null &&
                    user?.id !== englishAwardBidderId &&
                    !pendingPurchase)
                }
                listingType={listing.type}
                chain={listing.chain}
                network={listing.network}
                isSecondary={Boolean(listing.isSecondary)}
                creatorRoyaltyBps={listing.creatorRoyaltyBps ?? null}
                dropState={drop.state}
                repeatable={cap == null || cap > 1}
                minted={minted}
                canStageRising={canUserStageListing(user, listing)}
                suppressBuy={saleMode === "english" && auctionLive}
                pendingPurchase={
                  pendingPurchase
                    ? {
                        purchaseId: pendingPurchase.id,
                        status: pendingPurchase.status ?? "pending_payment",
                      }
                    : null
                }
              />
            ) : null}

            {(saleMode === "fixed" || saleMode === "timed_window") &&
            minted &&
            !isSold &&
            !listing.delisted ? (
              <OfferPanel
                listingId={listing.id}
                listPriceUsd={listing.priceUsd}
                isSeller={user?.id === sellerId || user?.id === listing.creatorId}
                sessionUserId={user?.id ?? null}
              />
            ) : null}

            {collectorCanList && completedPurchase ? (
              <div className="fm-listing-form" style={{ marginTop: "0.85rem" }}>
                <h3
                  className="display"
                  style={{ margin: "0 0 0.35rem", fontSize: "1.05rem" }}
                >
                  You own this
                </h3>
                <p className="fm-form-note" style={{ margin: "0 0 0.5rem" }}>
                  List it for sale on FreshMint (Buy now secondary).
                </p>
                <ResaleListButton
                  purchaseId={completedPurchase.id}
                  defaultPriceUsd={completedPurchase.amountUsd}
                />
              </div>
            ) : null}
          </div>

          {isManager ? (
            <ManageListingPanel
              listingId={listing.id}
              saleMode={saleMode}
              startingBidUsd={listing.startingBidUsd}
              reserveUsd={listing.reserveUsd}
              priceUsd={listing.priceUsd}
              delisted={Boolean(listing.delisted)}
              stage={listing.stage}
              alreadyBoosted={listing.featuredBoostedAt != null}
              defaultNetwork={listing.network}
              showBoost={user?.id === listing.creatorId}
              hasBids={listing.currentHighBidUsd != null}
            />
          ) : null}

          <dl className="listing-detail__signals">
            <dt>Saves</dt>
            <dd>{listing.signals.saves}</dd>
            <dt>Unique viewers</dt>
            <dd>{listing.signals.uniqueViewers}</dd>
            <dt>Page views</dt>
            <dd>{listing.signals.pageViews}</dd>
            <dt>Nominations</dt>
            <dd>{listing.signals.nominationScore}</dd>
            <dt>Impressions (week)</dt>
            <dd>{listing.signals.impressionsThisWeek}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
