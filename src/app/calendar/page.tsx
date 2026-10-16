import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { getDropCalendar } from "@/lib/marketplace/calendar";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Drop calendar",
  description:
    "Upcoming open editions and timed drops, paced by congestion caps.",
};

function fmt(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CalendarPage() {
  const cal = await getDropCalendar();

  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Drop calendar</h1>
        <p className="page-lead__copy">
          Upcoming and live open editions and timed drops. Set a reminder by
          saving a work, then come back when it opens.
        </p>
      </header>
      <h2 className="display" style={{ fontSize: "1.5rem" }}>
        Open editions
      </h2>
      {cal.openEditions.filter((e) => e.status !== "ended").length === 0 ? (
        <p style={{ color: "var(--ink-muted)", margin: "1rem 0 2.5rem" }}>
          No open editions are live or scheduled. Creators can schedule one from{" "}
          <Link href="/create?intent=drop">Create</Link>.
        </p>
      ) : (
      <PuzzleRail style={{ margin: "1rem 0 2.5rem" }}>
        {cal.openEditions
          .filter((e) => e.status !== "ended")
          .map((e) => (
            <WorkCard
              key={e.listing.id}
              listing={e.listing}
              bucket={e.status}
              showActions
              footer={
                <>
                  {fmt(e.startsAt)} → {fmt(e.endsAt)}
                </>
              }
            />
          ))}
      </PuzzleRail>
      )}

      <h2 className="display" style={{ fontSize: "1.5rem" }}>
        Timed drops
      </h2>
      {cal.auctions.filter((e) => e.status !== "ended").length === 0 ? (
        <p style={{ color: "var(--ink-muted)", marginTop: "1rem" }}>
          No timed drops are live or scheduled. Creators can schedule one from <Link href="/create?intent=auction">Create</Link>.
        </p>
      ) : (
      <PuzzleRail style={{ marginTop: "1rem" }}>
        {cal.auctions
          .filter((e) => e.status !== "ended")
          .map((e) => (
            <WorkCard
              key={e.listing.id}
              listing={e.listing}
              bucket={e.status}
              showActions
              footer={
                <>
                  {fmt(e.startsAt)} → {fmt(e.endsAt)}
                </>
              }
            />
          ))}
      </PuzzleRail>
      )}
    </div>
  );
}
