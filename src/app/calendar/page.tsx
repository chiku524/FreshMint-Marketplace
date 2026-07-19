import { WorkCard } from "@/components/WorkCard";
import { getDropCalendar } from "@/lib/marketplace/calendar";

export const dynamic = "force-dynamic";

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
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.4rem" }}>
        Drop calendar
      </h1>
      <p style={{ color: "var(--ink-muted)", maxWidth: "54ch", marginBottom: "1.25rem" }}>
        Congestion caps: {cal.caps.maxOeStartsPerHour} OE starts/hour ·{" "}
        {cal.caps.maxAuctionStartsPerHour} auction starts/hour ·{" "}
        {cal.caps.maxConcurrentOeOnRising} concurrent OE on Rising ·{" "}
        {cal.caps.liveAuctionStripSlots} live auction strip slots.
      </p>
      <div className="metric-grid" style={{ marginBottom: "2rem" }}>
        <div
          style={{
            border: "1px solid var(--line)",
            padding: "1rem",
            background: "var(--panel)",
          }}
        >
          <div style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
            Live OE on Rising path
          </div>
          <div className="display" style={{ fontSize: "1.8rem" }}>
            {cal.risingOeLiveCount}/{cal.caps.maxConcurrentOeOnRising}
          </div>
        </div>
        <div
          style={{
            border: "1px solid var(--line)",
            padding: "1rem",
            background: "var(--panel)",
          }}
        >
          <div style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
            Live auctions
          </div>
          <div className="display" style={{ fontSize: "1.8rem" }}>
            {cal.liveAuctionStripCount}/{cal.caps.liveAuctionStripSlots}
          </div>
        </div>
      </div>

      <h2 className="display" style={{ fontSize: "1.5rem" }}>
        Open editions
      </h2>
      <div className="lane-rail" style={{ margin: "1rem 0 2.5rem" }}>
        {cal.openEditions
          .filter((e) => e.status !== "ended")
          .map((e) => (
            <div key={e.listing.id}>
              <WorkCard
                listing={e.listing}
                bucket={e.status}
                showActions
              />
              <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                {fmt(e.startsAt)} → {fmt(e.endsAt)}
              </p>
            </div>
          ))}
      </div>

      <h2 className="display" style={{ fontSize: "1.5rem" }}>
        Auctions
      </h2>
      <div className="lane-rail" style={{ marginTop: "1rem" }}>
        {cal.auctions
          .filter((e) => e.status !== "ended")
          .map((e) => (
            <div key={e.listing.id}>
              <WorkCard listing={e.listing} bucket={e.status} showActions />
              <p style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
                {fmt(e.startsAt)} → {fmt(e.endsAt)}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
