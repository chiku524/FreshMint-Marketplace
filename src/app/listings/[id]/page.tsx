import { FollowButton } from "@/components/FollowButton";
import { FeaturedBoostButton } from "@/components/FeaturedBoostButton";
import { BidPanel } from "@/components/BidPanel";
import { ListingActions } from "@/components/ListingActions";
import { SaleModeEditor } from "@/components/SaleModeEditor";
import { minNextBidUsd, resolveSaleMode, saleModeBadge } from "@/lib/marketplace/sale-mode";
import { PageViewTracker } from "@/components/PageViewTracker";
import { TxExplorerLink } from "@/components/TxExplorerLink";
import { getNetwork, resolveNetwork } from "@/lib/chains/registry";
import { isEmergingListing } from "@/lib/discovery";
import { getSessionUser } from "@/lib/auth/session";
import { dropWindowFor, primarySupplyCap } from "@/lib/marketplace/drops";
import { canUserStageListing, stageLabel } from "@/lib/marketplace/lifecycle";
import { findBuyerOpenPurchase, listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { lazySettleEnglishAuction } from "@/lib/marketplace/english-auction";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const engine = await getDiscoveryEngine();
  const listing = engine.state.listings.get(id);
  if (!listing || listing.delisted) notFound();

  const creator = engine.state.creators.get(listing.creatorId);
  const collection = listing.collectionId
    ? engine.state.collections.get(listing.collectionId)
    : null;
  const emerging = creator
    ? isEmergingListing(listing, creator).emerging
    : false;
  const user = await getSessionUser();
  if (listing.stage === "draft" && user?.id !== listing.creatorId) {
    notFound();
  }
  // Cron-less English settle on view: award high bidder with pending purchase
  // (or mark unsold when reserve fails) before sold/pending lookups.
  const englishSettle = await lazySettleEnglishAuction(listing.id);

  const soldIds = await listClosedPrimarySaleIds();
  const pendingPurchase = user
    ? await findBuyerOpenPurchase(listing.id, user.id)
    : null;
  const following =
    user != null &&
    (engine.state.follows.get(user.id)?.followedArtistIds.includes(
      listing.creatorId,
    ) ??
      false);

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
            {listing.priceUsd != null ? ` · $${listing.priceUsd}` : " · timed drop"}
            {" · "}
            {listing.medium}
            {collection ? (
              <>
                {" · "}
                <Link href={`/collections/${collection.id}`}>{collection.title}</Link>
              </>
            ) : null}
          </p>
          <p className="listing-detail__desc">
            {listing.description || "No description yet."}
          </p>
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
            />
          </div>
          {listing.type === "auction" && saleMode === "timed_window" ? (
            <p className="listing-detail__note">
              Timed drop window
              {drop.state === "upcoming"
                ? " (not started)"
                : drop.state === "live"
                  ? " (live now)"
                  : drop.state === "ended"
                    ? " (ended)"
                    : ""}
              . Buy at the fixed USD-quoted list price in crypto while the window
              is open — no open bidding.
            </p>
          ) : null}

          {user?.id === listing.creatorId ? (
            <SaleModeEditor
              listingId={listing.id}
              saleMode={saleMode}
              startingBidUsd={listing.startingBidUsd}
              reserveUsd={listing.reserveUsd}
            />
          ) : null}
          {saleMode === "english" ? (
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

          <ListingActions
            listingId={listing.id}
            creatorId={listing.creatorId}
            priceUsd={
              englishAwardAmount != null ? englishAwardAmount : listing.priceUsd
            }
            stage={listing.stage}
            sold={
              (soldIds.has(listing.id) && !pendingPurchase) ||
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
            pendingPurchase={
              pendingPurchase
                ? {
                    purchaseId: pendingPurchase.id,
                    status: pendingPurchase.status ?? "pending_payment",
                  }
                : null
            }
          />
          {user?.id === listing.creatorId && listing.stage !== "draft" ? (
            <FeaturedBoostButton
              listingId={listing.id}
              alreadyBoosted={listing.featuredBoostedAt != null}
              defaultNetwork={listing.network}
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
