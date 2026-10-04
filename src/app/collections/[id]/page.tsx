import { CollectionDetailTabs } from "@/components/CollectionDetailTabs";
import { CollectionPackagePanel } from "@/components/CollectionPackagePanel";
import { CollectionProfileHeader } from "@/components/CollectionProfileHeader";
import { UpdateFeeRecipientsButton } from "@/components/UpdateFeeRecipientsButton";
import { WorkCard } from "@/components/WorkCard";
import { getSessionUser } from "@/lib/auth/session";
import { resolveNetwork } from "@/lib/chains/registry";
import { formatBytes, COLLECTION_MEDIA_CAP_BYTES } from "@/lib/marketplace/drops";
import { aggregateCollectionVolumesUsd } from "@/lib/marketplace/collections-browse";
import { deriveCollectionFloorUsd } from "@/lib/marketplace/home-discovery";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  const pieces = [...engine.state.listings.values()]
    .filter((l) => l.collectionId === collection.id && !l.delisted)
    .sort((a, b) => b.createdAt - a.createdAt);

  const hero =
    pieces.find((l) => l.id === collection.heroListingId) ?? pieces[0];
  const coverUrl = hero?.mediaUrl ?? null;
  const floorUsd = deriveCollectionFloorUsd(pieces);
  const volumeUsd = volumes.get(collection.id) ?? 0;
  const creatorName = creator?.displayName ?? collection.creatorId;
  const aboutBlurb =
    hero?.description?.trim() ||
    `Creator-owned set on ${network}. Collectors pay crypto and receive the NFT at purchase.`;

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
        coverUrl={coverUrl}
        chain={network}
        itemCount={collection.totalItems || pieces.length}
        floorUsd={floorUsd}
        volumeUsd={volumeUsd}
        description={aboutBlurb}
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
          isOwner ? (
            <Link href="/create" className="badge featured">
              Add works
            </Link>
          ) : null
        }
      />

      {isOwner ? (
        <div className="collection-detail__owner">
          <CollectionPackagePanel
            collectionId={collection.id}
            isOwner={isOwner}
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

      <CollectionDetailTabs
        itemCount={pieces.length}
        items={
          pieces.length ? (
            <div className="collection-items-grid">
              {pieces.map((listing) => (
                <WorkCard
                  key={listing.id}
                  listing={listing}
                  showActions
                  sold={soldIds.has(listing.id)}
                  creatorName={creatorName}
                  creatorAvatarUrl={creator?.avatarUrl}
                  collection={{
                    id: collection.id,
                    title: collection.title,
                    slug: collection.slug,
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="collection-detail__empty">
              No pieces yet.{" "}
              <Link href="/create">Add a drop to this collection</Link>.
            </p>
          )
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
