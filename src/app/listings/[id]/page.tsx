import { FollowButton } from "@/components/FollowButton";
import { ListingActions } from "@/components/ListingActions";
import { isEmergingListing } from "@/lib/discovery";
import { getSessionUser } from "@/lib/auth/session";
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
  const emerging = creator
    ? isEmergingListing(listing, creator).emerging
    : false;
  const user = await getSessionUser();
  const following =
    user != null &&
    (engine.state.follows.get(user.id)?.followedArtistIds.includes(
      listing.creatorId,
    ) ??
      false);

  const hue = [...listing.id].reduce((h, c) => (h + c.charCodeAt(0) * 17) % 360, 0);
  const media = listing.mediaUrl;

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <p style={{ margin: "0 0 1rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        <Link href="/open">Open Lane</Link>
        {" · "}
        <Link href={`/creators/${listing.creatorId}`}>
          {creator?.displayName ?? "Creator"}
        </Link>
      </p>

      <div
        style={{
          display: "grid",
          gap: "2rem",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
        }}
        className="listing-detail-grid"
      >
        <div
          className="work-media"
          style={
            media
              ? {
                  minHeight: "420px",
                  backgroundImage: `url(${media})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  border: "1px solid var(--line)",
                }
              : {
                  minHeight: "420px",
                  border: "1px solid var(--line)",
                  background: `
                    linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
                    linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), #0a100e)
                  `,
                }
          }
        />

        <div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            {emerging ? <span className="badge emerging">Emerging</span> : null}
            <span className="badge">{listing.chain}</span>
            <span className="badge">{listing.type.replace("_", " ")}</span>
            <span className="badge">{listing.stage.replace("_", " ")}</span>
          </div>
          <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
            {listing.title}
          </h1>
          <p style={{ color: "var(--ink-muted)", margin: "0 0 1rem" }}>
            by{" "}
            <Link href={`/creators/${listing.creatorId}`}>
              {creator?.displayName ?? listing.creatorId}
            </Link>
            {listing.priceUsd != null ? ` · $${listing.priceUsd}` : " · auction"}
            {" · "}
            {listing.medium}
          </p>
          <p style={{ maxWidth: "48ch", lineHeight: 1.55 }}>
            {listing.description || "No description yet."}
          </p>
          {listing.styleTags.length > 0 ? (
            <p style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "1rem" }}>
              {listing.styleTags.map((t) => (
                <span key={t} className="badge">
                  {t}
                </span>
              ))}
            </p>
          ) : null}

          <div style={{ marginTop: "1.25rem" }}>
            <FollowButton
              artistId={listing.creatorId}
              initiallyFollowing={following}
            />
          </div>

          <ListingActions
            listingId={listing.id}
            creatorId={listing.creatorId}
            priceUsd={listing.priceUsd}
            stage={listing.stage}
          />

          <dl
            style={{
              marginTop: "2rem",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "0.35rem 1rem",
              color: "var(--ink-muted)",
              fontSize: "0.9rem",
            }}
          >
            <dt>Saves</dt>
            <dd style={{ margin: 0 }}>{listing.signals.saves}</dd>
            <dt>Unique viewers</dt>
            <dd style={{ margin: 0 }}>{listing.signals.uniqueViewers}</dd>
            <dt>Nominations</dt>
            <dd style={{ margin: 0 }}>{listing.signals.nominationScore}</dd>
            <dt>Impressions (week)</dt>
            <dd style={{ margin: 0 }}>{listing.signals.impressionsThisWeek}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
