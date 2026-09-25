import {
  creatorsBrowseHref,
  type CreatorsSortId,
} from "@/lib/marketplace/creators-browse-config";
import Link from "next/link";

export function CreatorsPagination({
  sort,
  page,
  pageCount,
  total,
  hasPrev,
  hasNext,
}: {
  sort: CreatorsSortId;
  page: number;
  pageCount: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  if (total === 0) return null;

  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(pageCount, windowStart + 4);
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd; p += 1) pages.push(p);

  return (
    <nav className="fm-pagination" aria-label="Creators pages">
      <p className="fm-pagination__meta">
        Page {page} of {pageCount} · {total} creator{total === 1 ? "" : "s"}
      </p>
      <div className="fm-pagination__controls">
        {hasPrev ? (
          <Link
            href={creatorsBrowseHref({ sort, page: page - 1 })}
            className="fm-filter-tab"
          >
            Prev
          </Link>
        ) : (
          <span className="fm-filter-tab is-disabled">Prev</span>
        )}
        {pages.map((p) => (
          <Link
            key={p}
            href={creatorsBrowseHref({ sort, page: p })}
            className={`fm-filter-tab${p === page ? " is-active" : ""}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </Link>
        ))}
        {hasNext ? (
          <Link
            href={creatorsBrowseHref({ sort, page: page + 1 })}
            className="fm-filter-tab"
          >
            Next
          </Link>
        ) : (
          <span className="fm-filter-tab is-disabled">Next</span>
        )}
      </div>
    </nav>
  );
}
