import { CreatorAvatar } from "@/components/CreatorAvatar";
import { FollowButton } from "@/components/FollowButton";
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
              {creator.completedSales} sales · $
              {Math.round(creator.lifetimePrimaryVolumeUsd)} primary volume ·
              curator score {creator.curatorScore}
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
            <p className="profile-masthead__wallets">
              Wallets:{" "}
              {creator.wallets
                .map((w) => `${w.chain}:${w.address.slice(0, 8)}…`)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="profile-masthead__actions">
          <FollowButton
            artistId={id}
            initiallyFollowing={following}
            label="Follow artist"
          />
          {user?.id === id ? (
            <Link
              href="/me/settings"
              className="badge"
              style={{ fontSize: "0.82rem" }}
            >
              Edit profile photo
            </Link>
          ) : null}
        </div>
      </header>

      <div className="profile-stack">
        <ProfileWorksExplorer
          initialView={initialView}
          creatorName={creator.displayName}
          collections={collectionItems}
          emptyCollections={
            <p className="fm-empty-copy">
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
    </div>
  );
}
