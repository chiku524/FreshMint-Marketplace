import { CreatorAvatar } from "@/components/CreatorAvatar";
import { FollowButton } from "@/components/FollowButton";
import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { ProfileWorksExplorer } from "@/components/ProfileWorksExplorer";
import { getSessionUser } from "@/lib/auth/session";
import { isEmergingCreator } from "@/lib/discovery";
import { aggregateCollectionVolumesUsd } from "@/lib/marketplace/collections-browse";
import { buildCreatorProfileCollections } from "@/lib/marketplace/profile-collections";
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
  const collectionItems = buildCreatorProfileCollections({
    collections: [...engine.state.collections.values()].filter(
      (c) => c.creatorId === id,
    ),
    listings: [...engine.state.listings.values()],
    volumes,
  });

  const works = [...engine.state.listings.values()]
    .filter((l) => l.creatorId === id && !l.delisted && l.softLaunchedAt != null)
    .sort((a, b) => (b.softLaunchedAt ?? 0) - (a.softLaunchedAt ?? 0))
    .slice(0, 12);

  const user = await getSessionUser();
  const following =
    user != null &&
    (engine.state.follows.get(user.id)?.followedArtistIds.includes(id) ?? false);

  return (
    <div className="page-wrap">
      <p className="page-crumb">
        <Link href="/creators">Creators</Link>
        {" · "}
        <Link href="/open">Open Lane</Link>
        {" · "}
        <Link href="/rising">Rising</Link>
      </p>

      <header className="profile-masthead">
        <div className="profile-masthead__identity">
          <CreatorAvatar
            id={creator.id}
            displayName={creator.displayName}
            avatarUrl={creator.avatarUrl}
            size={72}
          />
          <div className="profile-masthead__copy">
            <div className="profile-masthead__badges">
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
                <span
                  className="badge featured"
                  title={`≥ $${ACTIVE_SELLER_MIN_VOLUME_USD} all-time completed volume`}
                >
                  Active seller
                </span>
              ) : null}
            </div>
            <h1 className="display profile-masthead__name">
              {creator.displayName}
            </h1>
            <p className="profile-masthead__meta">
              {creator.completedSales} sale{creator.completedSales === 1 ? "" : "s"}
              {" \u00b7 "}
              {"$" + Math.round(creator.lifetimePrimaryVolumeUsd).toLocaleString("en-US")} sold
            </p>
            {creator.bio ? (
              <p className="profile-masthead__bio">{creator.bio}</p>
            ) : null}
            {creator.websiteUrl || creator.twitterUrl || creator.farcasterUrl ? (
              <p className="profile-masthead__links">
                {creator.websiteUrl ? (
                  <a
                    href={creator.websiteUrl}
                    className="badge"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Website
                  </a>
                ) : null}
                {creator.twitterUrl ? (
                  <a
                    href={creator.twitterUrl}
                    className="badge"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Twitter
                  </a>
                ) : null}
                {creator.farcasterUrl ? (
                  <a
                    href={creator.farcasterUrl}
                    className="badge"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Farcaster
                  </a>
                ) : null}
              </p>
            ) : null}
            {creator.wallets.length > 0 ? (
              <details className="profile-masthead__wallets">
                <summary>
                  {creator.wallets.length} linked wallet
                  {creator.wallets.length === 1 ? "" : "s"}
                </summary>
                <ul>
                  {creator.wallets.map((w) => (
                    <li key={`${w.chain}:${w.address}`} title={w.address}>
                      {w.chain}: {w.address.slice(0, 6)}{"\u2026"}{w.address.slice(-4)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </div>
        <div className="profile-masthead__actions">
          <FollowButton
            artistId={id}
            initiallyFollowing={following}
            label="Follow artist"
          />
          {user?.id === id ? (
            <Link href="/me/settings" className="fm-btn fm-btn--ghost">
              Edit profile
            </Link>
          ) : null}
        </div>
      </header>

      <div className="profile-stack">
        {works.length > 0 ? (
          <section className="me-section">
            <h2 className="display me-section__title">Works ({works.length})</h2>
            <PuzzleRail>
              {works.map((listing) => (
                <WorkCard
                  key={listing.id}
                  listing={listing}
                  creatorName={creator.displayName}
                  creatorAvatarUrl={creator.avatarUrl}
                  collection={
                    listing.collectionId
                      ? engine.state.collections.get(listing.collectionId) ?? null
                      : null
                  }
                />
              ))}
            </PuzzleRail>
          </section>
        ) : null}
        <ProfileWorksExplorer
          initialView={initialView}
          creatorName={creator.displayName}
          collections={collectionItems}
          emptyCollections={
            <p className="fm-empty-copy">
              {works.length > 0 ? "No collections yet \u2014 works above are standalone pieces." : "Nothing published yet."}
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
    </div>
  );
}
