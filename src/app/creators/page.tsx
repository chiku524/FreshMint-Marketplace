import { CreatorAvatar } from "@/components/CreatorAvatar";
import { CreatorsPagination } from "@/components/CreatorsPagination";
import { CreatorsSortTabs } from "@/components/CreatorsSortTabs";
import { FollowButton } from "@/components/FollowButton";
import { getSessionUser } from "@/lib/auth/session";
import {
  getCachedCreatorBrowseRows,
  sortCreatorBrowseRows,
} from "@/lib/marketplace/creators-browse";
import {
  CREATOR_TOP_MIN_VOLUME_USD_7D,
  paginateItems,
  parseCreatorsPage,
  parseCreatorsSort,
  type CreatorsSortId,
} from "@/lib/marketplace/creators-browse-config";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creators — FreshMint Marketplace",
  description:
    "Browse creators by 7-day sales volume, newest first listings, or all-time primary volume.",
};

function sortBlurb(sort: CreatorsSortId): string {
  switch (sort) {
    case "top":
      return `Ranked by completed primary USD volume over the last 7 days. Spam guard: more than $${CREATOR_TOP_MIN_VOLUME_USD_7D} in that window (at least one completed sale). Creators need at least one published work.`;
    case "new":
      return "Creators whose first public listing landed in the last 7 days, with at least one published work.";
    case "all_time":
      return "Creators with completed primary sales, ranked by all-time volume.";
  }
}

function emptyCopy(sort: CreatorsSortId): string {
  switch (sort) {
    case "top":
      return "No creators cleared a completed sale in the last 7 days yet. Soft-launch from Create, or try New / All-time volume.";
    case "new":
      return "No creators published their first work this week. Soft-launch from Create.";
    case "all_time":
      return "No creators with completed primary volume yet. Browse Open Lane while the first sales land.";
  }
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export default async function CreatorsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawSort = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort = parseCreatorsSort(rawSort);
  const page = parseCreatorsPage(sp.page);
  const engine = await getDiscoveryEngine();
  const user = await getSessionUser();
  const now = Date.now();

  const allRows = await getCachedCreatorBrowseRows();
  const sorted = sortCreatorBrowseRows(allRows, sort, now);
  const slice = paginateItems(sorted, page);

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Creators
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "54ch", marginBottom: "1rem" }}>
        Browseable directory with shareable sort tabs and pages. Profiles live at{" "}
        <code style={{ fontSize: "0.85em" }}>/creators/[id]</code>.
      </p>

      <CreatorsSortTabs active={sort} />
      <p
        style={{
          color: "var(--ink-muted)",
          fontSize: "0.9rem",
          maxWidth: "56ch",
          margin: "0.75rem 0 1.5rem",
        }}
      >
        {sortBlurb(sort)}
      </p>

      {slice.total === 0 ? (
        <section
          style={{
            border: "1px solid var(--line)",
            padding: "1.1rem 1.15rem",
            background: "var(--panel)",
            maxWidth: "40rem",
          }}
        >
          <h2 className="display" style={{ margin: "0 0 0.45rem", fontSize: "1.2rem" }}>
            Nothing here yet
          </h2>
          <p style={{ margin: 0, color: "var(--ink-muted)", lineHeight: 1.55 }}>
            {emptyCopy(sort)}
          </p>
          <p style={{ margin: "0.85rem 0 0", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <Link href="/create" className="badge emerging">
              Soft-launch a work
            </Link>
            <Link href="/open" className="badge">
              Open Lane
            </Link>
          </p>
        </section>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {slice.items.map((row) => {
              const following =
                user != null &&
                (engine.state.follows
                  .get(user.id)
                  ?.followedArtistIds.includes(row.id) ??
                  false);
              return (
                <li
                  key={row.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.85rem 0",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "center",
                      minWidth: 0,
                      flex: "1 1 14rem",
                    }}
                  >
                    <CreatorAvatar
                      id={row.id}
                      displayName={row.displayName}
                      avatarUrl={row.avatarUrl}
                      size={48}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.35rem",
                          flexWrap: "wrap",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {row.emerging ? (
                          <span className="badge emerging">Emerging</span>
                        ) : null}
                        {row.establishedBadge ? (
                          <span className="badge featured">Established</span>
                        ) : null}
                        {row.verifiedCreator ? (
                          <span className="badge">Verified</span>
                        ) : null}
                      </div>
                      <Link
                        href={`/creators/${row.id}`}
                        className="display"
                        style={{ fontSize: "1.25rem", color: "inherit" }}
                      >
                        {row.displayName}
                      </Link>
                      <p
                        style={{
                          margin: "0.2rem 0 0",
                          color: "var(--ink-muted)",
                          fontSize: "0.85rem",
                        }}
                      >
                        {row.publishedWorks} works
                        {row.collectionCount > 0
                          ? ` · ${row.collectionCount} collections`
                          : ""}
                        {" · "}
                        {sort === "top"
                          ? `${formatUsd(row.volumeUsd7d)} 7d`
                          : `${formatUsd(row.volumeUsdAllTime)} all-time`}
                        {" · "}
                        {row.completedSales} sales
                      </p>
                    </div>
                  </div>
                  <FollowButton artistId={row.id} initiallyFollowing={following} />
                </li>
              );
            })}
          </ul>
          <CreatorsPagination
            sort={sort}
            page={slice.page}
            pageCount={slice.pageCount}
            total={slice.total}
            hasPrev={slice.hasPrev}
            hasNext={slice.hasNext}
          />
        </>
      )}
    </div>
  );
}
