import { FollowButton } from "@/components/FollowButton";
import { BidPanel } from "@/components/BidPanel";
import { ListingActions } from "@/components/ListingActions";
import { ListingActivityTimeline } from "@/components/ListingActivityTimeline";
import { ListingMoreActionsModal } from "@/components/ListingMoreActionsModal";
import { ManageListingModal } from "@/components/ManageListingModal";
import { NftTraitRarity } from "@/components/NftTraitRarity";
import { OfferModal } from "@/components/OfferModal";
import { PublishLifecycleStatus } from "@/components/PublishLifecycleStatus";
import { ResaleListButton } from "@/components/ResaleListButton";
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
import { listListingActivity } from "@/lib/marketplace/activity";
import { dropWindowFor, primarySupplyCap } from "@/lib/marketplace/drops";
import { canUserStageListing, stageLabel } from "@/lib/marketplace/lifecycle";
import {
  canManageListing,
  findBuyerCompletedPurchase,
  hasActiveSecondaryForOrigin,
  listingHasPublicSurface,
  listingSellerId,
  listingVisibleOnCollectionPage,
} from "@/lib/marketplace/listing-manage";
import { buildListingPublishLifecycle } from "@/lib/marketplace/publish-status";
import { computeCollectionRarity } from "@/lib/marketplace/rarity";
import { findBuyerOpenPurchase, listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { lazySettleEnglishAuction } from "@/lib/marketplace/english-auction";
import { collectionHref } from "@/lib/marketplace/collection-slug";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { shortTxHash } from "@/lib/onchain/explorer";
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
  const isCollectionOwner =
    Boolean(collection) && user?.id === collection?.creatorId;
  const collectionPeers = collection
    ? [...engine.state.listings.values()].filter(
        (l) =>
          l.collectionId === collection.id &&
          listingVisibleOnCollectionPage(l, isCollectionOwner),
      )
    : [];
  const collectionRarity = collectionPeers.length
    ? computeCollectionRarity(collectionPeers)
    : null;
  const listingRarity = collectionRarity?.byListingId.get(listing.id) ?? null;
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

  const activity = await listListingActivity(listing.id, 40);
  const publishLifecycle =
    isManager && (listing.stage === "draft" || !minted)
      ? buildListingPublishLifecycle({
          stage: listing.stage,
          delisted: listing.delisted,
          tokenId: listing.tokenId,
          contractAddress: listing.contractAddress,
          mintTxHash: listing.mintTxHash,
          collectionDeployStatus: collection?.deployStatus,
          collectionContractAddress: collection?.contractAddress,
        })
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

  const displayPriceUsd =
    saleMode === "dutch"
      ? (dutchCurrentPriceUsd({
          startingBidUsd: listing.startingBidUsd,
          priceUsd: listing.priceUsd,
          reserveUsd: listing.reserveUsd,
          auctionStartsAt: listing.auctionStartsAt,
          auctionEndsAt: listing.auctionEndsAt,
        }) ?? listing.priceUsd)
      : listing.priceUsd;
  const priceLabel =
    displayPriceUsd != null
      ? `$${displayPriceUsd}`
      : saleMode === "dutch" || listing.priceUsd != null
        ? "$—"
        : "Timed listing";

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

        <div className="listing-detail__info">
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
          <div className="listing-detail__meta">
            <p className="listing-detail__byline">
              by{" "}
              <Link
                href={`/creators/${listing.creatorId}`}
                className="listing-detail__artist"
              >
                {creator?.displayName ?? listing.creatorId}
              </Link>
            </p>
            <p className="listing-detail__facts">
              <span className="listing-detail__price">{priceLabel}</span>
              <span className="listing-detail__sep" aria-hidden="true">
                ·
              </span>
              <span className="listing-detail__medium">{listing.medium}</span>
              {collection ? (
                <>
                  <span className="listing-detail__sep" aria-hidden="true">
                    ·
                  </span>
                  <Link
                    href={collectionHref(collection)}
                    className="listing-detail__collection"
                  >
                    {collection.title}
                  </Link>
                </>
              ) : null}
              {listingRarity?.rank != null ? (
                <>
                  <span className="listing-detail__sep" aria-hidden="true">
                    ·
                  </span>
                  <span
                    className="listing-detail__rarity"
                    title={`Rarity rank ${listingRarity.rank} of ${listingRarity.scoredSize}`}
                  >
                    Rank #{listingRarity.rank}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <p className="listing-detail__desc">
            {listing.description || "No description yet."}
          </p>
          {minted || listing.tokenId ? (
            <div className="listing-detail__chain">
              {listing.tokenId ? (
                <p
                  className="listing-detail__token"
                  title={
                    listing.contractAddress
                      ? `${listing.tokenId} · ${listing.contractAddress}`
                      : listing.tokenId
                  }
                >
                  <span className="listing-detail__token-label">Token</span>{" "}
                  <code className="listing-detail__token-id">
                    {shortTxHash(listing.tokenId, 12)}
                  </code>
                  {listing.contractAddress ? (
                    <span className="listing-detail__contract">
                      {" · "}
                      {shortTxHash(listing.contractAddress, 8)}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {listing.mintTxHash ? (
                <p className="listing-detail__chain-links">
                  <TxExplorerLink
                    hash={listing.mintTxHash}
                    chain={listing.chain}
                    network={listing.network}
                    label="View mint tx"
                    className="listing-detail__chain-link"
                  />
                  {explorerToken ? (
                    <>
                      <span className="listing-detail__sep" aria-hidden="true">
                        ·
                      </span>
                      <a
                        href={explorerToken}
                        target="_blank"
                        rel="noreferrer"
                        className="listing-detail__chain-link"
                      >
                        Token ↗
                      </a>
                    </>
                  ) : null}
                </p>
              ) : explorerToken ? (
                <p className="listing-detail__chain-links">
                  <a
                    href={explorerToken}
                    target="_blank"
                    rel="noreferrer"
                    className="listing-detail__chain-link"
                  >
                    Explorer ↗
                  </a>
                </p>
              ) : null}
            </div>
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
          {listingRarity &&
          collectionRarity?.hasTraits &&
          listingRarity.traits.length > 0 ? (
            <NftTraitRarity rarity={listingRarity} />
          ) : listing.traits && listing.traits.length > 0 ? (
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

            <div className="listing-detail__cta-group">
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
                  showSave={false}
                  showCommunityActions={false}
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
                <OfferModal
                  listingId={listing.id}
                  listPriceUsd={listing.priceUsd}
                  isSeller={user?.id === sellerId || user?.id === listing.creatorId}
                  sessionUserId={user?.id ?? null}
                />
              ) : null}

              {isManager ? (
                <ManageListingModal
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

              <ListingMoreActionsModal
                listingId={listing.id}
                stage={listing.stage}
              />
            </div>

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

          {publishLifecycle ? (
            <div className="listing-detail__publish-status">
              <PublishLifecycleStatus
                snapshot={publishLifecycle}
                title="Creation status"
              />
            </div>
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

      <ListingActivityTimeline events={activity} />
    </div>
  );
}
