import { CreatorAvatar } from "@/components/CreatorAvatar";
import { FollowButton } from "@/components/FollowButton";
import { ProfileWorksExplorer } from "@/components/ProfileWorksExplorer";
import { getSessionUser } from "@/lib/auth/session";
import { getNetwork, resolveNetwork } from "@/lib/chains/registry";
import { isEmergingCreator } from "@/lib/discovery";
import { aggregateCollectionVolumesUsd } from "@/lib/marketplace/collections-browse";
import {
  collectionVisibleOnCreatorProfile,
  mintedPublishedListingsInCollection,
} from "@/lib/marketplace/profile-collections";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { isActiveSeller, ACTIVE_SELLER_MIN_VOLUME_USD } from "@/lib/marketplace/trust";
import {
  PROFILE_VIEW_COOKIE,
  resolveProfileView,
} from "@/lib/profile-view";
import { creatorPageMetadata } from "@/lib/seo/site";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const GALLERY_SAMPLE_LIMIT = 6;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const engine = await getDiscoveryEngine();
  const creator = engine.state.creators.get(id);
  return creatorPageMetadata(creator ?? null);
}

export default async function CreatorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const viewQuery = typeof sp.view === "string" ? sp.view : null;
  const viewCookie = (await cookies()).get(PROFILE_VIEW_COOKIE)?.value;
  const initialView = resolveProfileView(viewQuery, viewCookie);

  const engine = await getDiscoveryEngine();
  const creator = engine.state.creators.get(id);
  if (!creator) notFound();

  const emerging = isEmergingCreator(creator);
  const volumes = await aggregateCollectionVolumesUsd();
  const allListings = [...engine.state.listings.values()];
  const ownedCollections = [...engine.state.collections.values()].filter(
    (c) => c.creatorId === id,
  );

  const collectionItems = ownedCollections
    .flatMap((collection) => {
      const inCollection = allListings.filter(
        (l) => l.collectionId === collection.id,
      );
      if (!collectionVisibleOnCreatorProfile(inCollection)) return [];

      const minted = mintedPublishedListingsInCollection(inCollection);
      const heroId = collection.heroListingId;
      const hero =
        minted.find((l) => l.id === heroId) ??
        minted.find((l) => l.mediaUrl) ??
        minted[0] ??
        null;

      return [
        {
          id: collection.id,
          title: collection.title,
          slug: collection.slug,
          totalItems: minted.length,
          chain: getNetwork(
            resolveNetwork(collection.network, collection.chain),
          ).label,
          coverUrl: collection.imageUrl || hero?.mediaUrl || null,
          volumeUsd: volumes.get(collection.id) ?? 0,
          sampleListings: minted.slice(0, GALLERY_SAMPLE_LIMIT),
          sortAt: hero?.createdAt ?? 0,
        },
      ];
    })
    .sort((a, b) => b.sortAt - a.sortAt);

  const user = await getSessionUser();
  const following =
    user != null &&
    (engine.state.follows.get(user.id)?.followedArtistIds.includes(id) ?? false);

  return (
    <div className="page-wrap">
      <p style={{ margin: "0 0 1rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        <Link href="/creators">Creators</Link>
        {" · "}
        <Link href="/open">Open Lane</Link>
        {" · "}
        <Link href="/rising">Rising</Link>
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "flex-start",
          marginBottom: "2rem",
        }}
      >
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", minWidth: 0 }}>
          <CreatorAvatar
            id={creator.id}
            displayName={creator.displayName}
            avatarUrl={creator.avatarUrl}
            size={72}
          />
          <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            {emerging.emerging ? (
              <span className="badge emerging">Emerging</span>
            ) : null}
            {creator.establishedBadge ? (
              <span className="badge featured">Established</span>
            ) : null}
            {creator.verifiedCreator ? (
              <span className="badge">Verified</span>
            ) : null}
            {isActiveSeller(creator.lifetimePrimaryVolumeUsd) ? (
              <span className="badge featured" title={`≥ $${ACTIVE_SELLER_MIN_VOLUME_USD} all-time completed volume`}>
                Active seller
              </span>
            ) : null}
          </div>
          <h1 className="display" style={{ margin: "0 0 0.4rem", fontSize: "2.6rem" }}>
            {creator.displayName}
          </h1>
          <p style={{ color: "var(--ink-muted)", margin: 0, maxWidth: "48ch" }}>
            {creator.completedSales} sales · $
            {Math.round(creator.lifetimePrimaryVolumeUsd)} primary volume ·
            curator score {creator.curatorScore}
          </p>
          {creator.bio ? (
            <p style={{ margin: "0.65rem 0 0", maxWidth: "52ch", lineHeight: 1.5 }}>
              {creator.bio}
            </p>
          ) : null}
          {(creator.websiteUrl || creator.twitterUrl || creator.farcasterUrl) ? (
            <p style={{ margin: "0.45rem 0 0", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {creator.websiteUrl ? (
                <a href={creator.websiteUrl} className="badge" target="_blank" rel="noreferrer">
                  Website
                </a>
              ) : null}
              {creator.twitterUrl ? (
                <a href={creator.twitterUrl} className="badge" target="_blank" rel="noreferrer">
                  Twitter
                </a>
              ) : null}
              {creator.farcasterUrl ? (
                <a href={creator.farcasterUrl} className="badge" target="_blank" rel="noreferrer">
                  Farcaster
                </a>
              ) : null}
            </p>
          ) : null}
          <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
            Wallets:{" "}
            {creator.wallets
              .map((w) => `${w.chain}:${w.address.slice(0, 8)}…`)
              .join(" · ")}
          </p>
          </div>
        </div>
        <div style={{ display: "grid", gap: "0.45rem", justifyItems: "end" }}>
          <FollowButton artistId={id} initiallyFollowing={following} label="Follow artist" />
          {user?.id === id ? (
            <Link href="/me/settings" className="badge" style={{ fontSize: "0.82rem" }}>
              Edit profile photo
            </Link>
          ) : null}
        </div>
      </div>

      <ProfileWorksExplorer
        initialView={initialView}
        creatorName={creator.displayName}
        collections={collectionItems}
        emptyCollections={
          <p style={{ color: "var(--ink-muted)" }}>
            No minted collections yet.
            {user?.id === id ? (
              <>
                {" "}
                <Link href="/create">Publish a collection</Link>.
              </>
            ) : null}
          </p>
        }
      />
    </div>
  );
}
