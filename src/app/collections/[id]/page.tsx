import { CollectionDetailTabs } from "@/components/CollectionDetailTabs";
import { CollectionEditModal } from "@/components/CollectionEditModal";
import { CollectionItemsWithRarity } from "@/components/CollectionItemsWithRarity";
import { CollectionPackagePanel } from "@/components/CollectionPackagePanel";
import { CollectionProfileHeader } from "@/components/CollectionProfileHeader";
import { CollectionPublishPanel } from "@/components/CollectionPublishPanel";
import { FollowButton } from "@/components/FollowButton";
import { LinkedTokensList } from "@/components/LinkedTokensList";
import { LinkedTokensModal } from "@/components/LinkedTokensModal";
import { ListingActivityTimeline } from "@/components/ListingActivityTimeline";
import { UpdateFeeRecipientsButton } from "@/components/UpdateFeeRecipientsButton";
import { getSessionUser } from "@/lib/auth/session";
import { resolveNetwork } from "@/lib/chains/registry";
import { listCollectionActivity } from "@/lib/marketplace/activity";
import { formatBytes, COLLECTION_MEDIA_CAP_BYTES } from "@/lib/marketplace/drops";
import { aggregateCollectionVolumesUsd } from "@/lib/marketplace/collections-browse";
import { deriveCollectionFloorUsd } from "@/lib/marketplace/home-discovery";
import {
  listingVisibleOnCollectionPage,
} from "@/lib/marketplace/listing-manage";
import {
  orderCollectionPieces,
  parseCollectionSort,
} from "@/lib/marketplace/rarity-order";
import { computeCollectionRarity } from "@/lib/marketplace/rarity";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { collectionPageMetadata } from "@/lib/seo/site";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: idOrSlug } = await params;
  const engine = await getDiscoveryEngine();
  const surface = engine.getCollectionSurface(idOrSlug);
  if (!surface) return collectionPageMetadata(null);
  const { collection } = surface;
  const heroId = collection.heroListingId;
  const hero = heroId ? engine.state.listings.get(heroId) : null;
  const cover =
    [...engine.state.listings.values()].find((l) => l.collectionId === collection.id)
      ?.mediaUrl ?? null;
  return collectionPageMetadata({
    id: collection.id,
    title: collection.title,
    slug: collection.slug,
    description: collection.description,
    imageUrl: collection.imageUrl,
    bannerUrl: collection.bannerUrl,
    coverUrl: hero?.mediaUrl ?? cover,
  });
}

const GALLERY_PAGE_SIZE = 200;

export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ page?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const pageParam = Number(sp?.page ?? "1");
  const sort = parseCollectionSort(sp?.sort);
  const { id: idOrSlug } = await params;
  const engine = await getDiscoveryEngine();
  const surface = engine.getCollectionSurface(idOrSlug);
  if (!surface) notFound();

  const { collection, hasTraction } = surface;
  const creator = engine.state.creators.get(collection.creatorId);
  const soldIds = await listClosedPrimarySaleIds();
  const volumes = await aggregateCollectionVolumesUsd();
  const user = await getSessionUser();
  const network = resolveNetwork(collection.network, collection.chain);
  const isOwner = user?.id === collection.creatorId;
  const canUpdateFeeRecipients =
    isOwner &&
    collection.chain === "evm" &&
    collection.deployStatus === "confirmed" &&
    Boolean(collection.contractAddress) &&
    !String(collection.contractAddress).startsWith("pending:");
  // Full collection inventory (not traction-capped surface samples).
  const allInCollection = [...engine.state.listings.values()]
    .filter((l) => l.collectionId === collection.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  // Gallery: on-chain minted works only (owners and buyers).
  const pieces = allInCollection.filter((l) =>
    listingVisibleOnCollectionPage(l, isOwner),
  );
  // Owner publish rail still needs unminted / unlaunched drafts.
  const ownerDrafts = isOwner
    ? allInCollection.filter((l) => l.stage === "draft" && !l.delisted)
    : [];

  const hero =
    pieces.find((l) => l.id === collection.heroListingId) ??
    pieces[0] ??
    null;
  const coverUrl = hero?.mediaUrl ?? null;
  const floorUsd = deriveCollectionFloorUsd(pieces);
  const volumeUsd = volumes.get(collection.id) ?? 0;
  const creatorName = creator?.displayName ?? collection.creatorId;
  const aboutBlurb =
    collection.description?.trim() ||
    hero?.description?.trim() ||
    `Creator-owned set on ${network}. Collectors pay crypto and receive the NFT at purchase.`;
  const headerItemCount = pieces.length || 0;
  const awaitingMint = allInCollection.filter(
    (l) => !l.delisted && !(l.tokenId && l.contractAddress),
  ).length;
  const collectionActivity = await listCollectionActivity(collection.id, 30);
  const liveCount = allInCollection.filter(
    (l) => l.stage !== "draft" && !l.delisted,
  ).length;
  const rarity = computeCollectionRarity(pieces);
  // 10k-item collections: render the gallery a page at a time so the HTML /
  // RSC payload stays small. Floor, rarity and counts still use every piece.
  const pageCount = Math.max(1, Math.ceil(pieces.length / GALLERY_PAGE_SIZE));
  const page = Number.isFinite(pageParam)
    ? Math.min(Math.max(1, Math.floor(pageParam)), pageCount)
    : 1;
  const ordered = orderCollectionPieces(
    pieces,
    rarity.hasTraits ? rarity.byListingId : new Map(),
    sort,
  );
  const pagePieces = ordered.slice(
    (page - 1) * GALLERY_PAGE_SIZE,
    page * GALLERY_PAGE_SIZE,
  );
  const basePath = `/collections/${collection.slug || collection.id}`;
  const hrefFor = (n: number, s: string) => {
    const q = new URLSearchParams();
    if (n > 1) q.set("page", String(n));
    if (s !== "newest") q.set("sort", s);
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const pageHref = (n: number) => hrefFor(n, sort);
  // Only ship rarity data for the cards on this page.
  const pageRarityById = Object.fromEntries(
    pagePieces.map((l) => [l.id, rarityById[l.id]]).filter(([, r]) => r),
  );
  const rarityById = Object.fromEntries(rarity.byListingId);

  return (
    <div className="page-wrap collection-detail">
      <p className="collection-detail__crumb">
        <Link href="/collections">Collections</Link>
        {" / "}
        <span>{collection.title}</span>
      </p>

      <CollectionProfileHeader
        id={collection.id}
        title={collection.title}
        creatorId={collection.creatorId}
        creatorName={creatorName}
        creatorAvatarUrl={creator?.avatarUrl}
        imageUrl={collection.imageUrl}
        bannerUrl={collection.bannerUrl}
        coverUrl={coverUrl}
        chain={network}
        itemCount={headerItemCount}
        pendingCount={awaitingMint}
        floorUsd={floorUsd}
        volumeUsd={volumeUsd}
        description={aboutBlurb}
        websiteUrl={collection.websiteUrl}
        twitterUrl={collection.twitterUrl}
        discordUrl={collection.discordUrl}
        instagramUrl={collection.instagramUrl}
        badges={
          <>
            {collection.dropKind && collection.dropKind !== "none" ? (
              <span className="badge emerging">
                {collection.dropKind === "open"
                  ? "Open edition"
                  : "Limited drop"}
              </span>
            ) : null}
            {hasTraction ? <span className="badge emerging">Traction</span> : null}
            {collection.deployStatus === "confirmed" ? (
              <span className="badge">Deployed</span>
            ) : null}
          </>
        }
        actions={
          <>
            {!isOwner ? (
              <FollowButton
                artistId={collection.creatorId}
                initiallyFollowing={
                  user != null &&
                  (engine.state.follows
                    .get(user.id)
                    ?.followedArtistIds.includes(collection.creatorId) ??
                    false)
                }
              />
            ) : null}
            {isOwner ? (
              <>
                <CollectionEditModal
                  collectionId={collection.id}
                  description={collection.description ?? ""}
                  imageUrl={collection.imageUrl}
                  bannerUrl={collection.bannerUrl}
                  websiteUrl={collection.websiteUrl}
                  twitterUrl={collection.twitterUrl}
                  discordUrl={collection.discordUrl}
                  instagramUrl={collection.instagramUrl}
                />
                <LinkedTokensModal
                  collectionId={collection.id}
                  initialTokens={collection.linkedTokens ?? []}
                  chain={collection.chain}
                  contractAddress={collection.contractAddress}
                />
                <Link
                  href={`/create?collectionId=${encodeURIComponent(collection.id)}`}
                  className="fm-btn fm-btn--ghost"
                >
                  Add works
                </Link>
              </>
            ) : null}
          </>
        }
      />

      {(collection.linkedTokens?.length ?? 0) > 0 ? (
        <LinkedTokensList
          tokens={collection.linkedTokens ?? []}
          collectionChain={collection.chain}
          collectionNetwork={collection.network}
        />
      ) : null}

      {isOwner && awaitingMint > 0 ? (
        <section className="collection-owner-callout" aria-label="Finish publishing">
          <div>
            <p className="collection-owner-callout__title">
              {awaitingMint.toLocaleString("en-US")} piece{awaitingMint === 1 ? " is" : "s are"} waiting to be minted
            </p>
            <p className="collection-owner-callout__body">
              Collectors can&apos;t see or buy {awaitingMint === 1 ? "it" : "them"} until you mint
              and publish. You pay network gas; finished batches are kept if you stop.
            </p>
          </div>
          <a href="#publish" className="fm-btn fm-btn--primary">
            Finish minting
          </a>
        </section>
      ) : null}

      {isOwner ? (
        <div className="collection-detail__owner" id="publish">
          <CollectionPublishPanel
            collectionId={collection.id}
            network={network}
            deployStatus={collection.deployStatus ?? "none"}
            contractAddress={collection.contractAddress}
            liveCount={liveCount}
            drafts={ownerDrafts.map((l) => ({
              id: l.id,
              // Panel shows counts only; skip titles to keep 10k-draft payloads small.
              title: "",
              minted: Boolean(
                l.tokenId && l.contractAddress && l.mintTxHash,
              ),
            }))}
          />
          {canUpdateFeeRecipients && collection.contractAddress ? (
            <UpdateFeeRecipientsButton
              collectionId={collection.id}
              network={network}
              contractAddress={collection.contractAddress}
            />
          ) : null}
        </div>
      ) : null}

      {/* Owners configure package sell; buyers see buy UI when enabled. */}
      <CollectionPackagePanel
        collectionId={collection.id}
        collectionSlug={collection.slug}
        isOwner={isOwner}
      />

      <CollectionDetailTabs
        itemCount={pieces.length}
        activityCount={collectionActivity.length}
        items={
          pieces.length ? (
            <>
            <CollectionItemsWithRarity
              pieces={pagePieces}
              rarityById={pageRarityById}
              sort={sort}
              sortHrefs={{ newest: hrefFor(1, "newest"), rarity: hrefFor(1, "rarity") }}
              hasTraits={rarity.hasTraits}
              soldIds={[...soldIds]}
              isOwner={isOwner}
              creatorName={creatorName}
              creatorAvatarUrl={creator?.avatarUrl}
              collection={{
                id: collection.id,
                title: collection.title,
                slug: collection.slug,
              }}
            />
            {pageCount > 1 ? (
              <nav aria-label="Collection pages" className="collection-detail__pager">
                {page > 1 ? <Link href={pageHref(page - 1)}>{"\u2190 Previous"}</Link> : null}
                <span>
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? <Link href={pageHref(page + 1)}>{"Next \u2192"}</Link> : null}
              </nav>
            ) : null}
            </>
          ) : (
            <p className="collection-detail__empty">
              {isOwner ? (
                ownerDrafts.length > 0 || awaitingMint > 0 ? (
                  <>
                    Nothing is live yet. Use <strong>Finish minting</strong> above to
                    mint your drafts, or{" "}
                    <Link
                      href={`/create?collectionId=${encodeURIComponent(collection.id)}`}
                    >
                      add more works
                    </Link>
                    . Track status in <Link href="/studio">Studio</Link>.
                  </>
                ) : (
                  <>
                    No pieces yet.{" "}
                    <Link
                      href={`/create?collectionId=${encodeURIComponent(collection.id)}`}
                    >
                      Add a drop to this collection
                    </Link>
                    {" · "}
                    <Link href="/studio">Studio</Link>.
                  </>
                )
              ) : (
                <>
                  {awaitingMint > 0
                    ? "The creator hasn't minted these pieces yet, so nothing is for sale. "
                    : "Nothing in this collection yet. "}
                  <Link href={`/creators/${collection.creatorId}`}>
                    Follow {creatorName}
                  </Link>{" "}
                  to hear when it goes live.
                </>
              )}
            </p>
          )
        }
        activity={
          <ListingActivityTimeline
            events={collectionActivity}
            showListingLinks
            emptyLabel="No mint, list, offer, or sale activity in this collection yet."
          />
        }
        about={
          <dl className="collection-about">
            <div>
              <dt>Network</dt>
              <dd>{network}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>{collection.totalItems || pieces.length}</dd>
            </div>
            {rarity.hasTraits ? (
              <div>
                <dt>Rarity</dt>
                <dd>
                  Statistical trait rarity on {rarity.scoredSize} of{" "}
                  {rarity.collectionSize} pieces (rank 1 = rarest). Pieces
                  without traits are not ranked.
                </dd>
              </div>
            ) : null}
            {collection.dropStartsAt && collection.dropEndsAt ? (
              <div>
                <dt>Drop window</dt>
                <dd>
                  {new Date(collection.dropStartsAt).toLocaleString()} –{" "}
                  {new Date(collection.dropEndsAt).toLocaleString()}
                  {collection.dropPriceUsd != null
                    ? ` · $${collection.dropPriceUsd}`
                    : ""}
                </dd>
              </div>
            ) : null}
            {collection.contractAddress ? (
              <div>
                <dt>Contract</dt>
                <dd className="collection-about__mono">
                  {collection.contractAddress}
                </dd>
              </div>
            ) : null}
            {(collection.linkedTokens?.length ?? 0) > 0 ? (
              <div>
                <dt>Linked tokens</dt>
                <dd>
                  <LinkedTokensList
                    tokens={collection.linkedTokens ?? []}
                    collectionChain={collection.chain}
                    collectionNetwork={collection.network}
                    heading="Linked tokens"
                  />
                </dd>
              </div>
            ) : null}
            {collection.mediaBytes ? (
              <div>
                <dt>Media</dt>
                <dd>
                  {formatBytes(collection.mediaBytes)} of{" "}
                  {formatBytes(COLLECTION_MEDIA_CAP_BYTES)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Creator</dt>
              <dd>
                <Link href={`/creators/${collection.creatorId}`}>
                  {creatorName}
                </Link>
              </dd>
            </div>
          </dl>
        }
      />
    </div>
  );
}
