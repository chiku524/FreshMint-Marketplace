import { PuzzleRail } from "@/components/PuzzleRail";
import { WorkCard } from "@/components/WorkCard";
import { getNetwork, isNetworkId } from "@/lib/chains/registry";
import { getSessionUser } from "@/lib/auth/session";
import { getUserAssetProfile } from "@/lib/marketplace/profile";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
        <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.2rem" }}>
          Account
        </h1>
        <p style={{ color: "var(--ink-muted)" }}>
          Sign in with a wallet or demo persona to view your assets and security
          settings.
        </p>
      </div>
    );
  }

  const profile = await getUserAssetProfile(user.id);
  if (!profile) redirect("/");

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "baseline",
          marginBottom: "0.5rem",
        }}
      >
        <h1 className="display" style={{ margin: 0, fontSize: "2.4rem" }}>
          {profile.displayName}
        </h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/me/security" className="badge featured">
            Security {profile.totpEnabled ? "· 2FA on" : "· set up 2FA"}
          </Link>
          <Link href={`/creators/${profile.userId}`} className="badge">
            Public profile
          </Link>
        </div>
      </div>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.75rem", maxWidth: "52ch" }}>
        Your FreshMint assets — created works, collected pieces, shelves, wallets,
        and recent bridges. Role: {profile.role} · curator score{" "}
        {profile.curatorScore}
        {profile.verifiedCreator ? " · verified" : ""}
        {profile.establishedBadge ? " · established" : ""}.
      </p>

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Wallets
        </h2>
        {profile.wallets.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>No wallets linked yet.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.45rem" }}>
            {profile.wallets.map((w) => (
              <li
                key={`${w.chain}-${w.address}`}
                className="badge"
                style={{ justifySelf: "start", fontFamily: "monospace" }}
              >
                {w.network ?? w.chain}: {w.address}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Created ({profile.created.length})
        </h2>
        {profile.created.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            Nothing created yet. <Link href="/create">Soft-launch a work</Link>.
          </p>
        ) : (
          <PuzzleRail>
            {profile.created.map((listing) => (
              <WorkCard
                key={listing.id}
                listing={listing}
                showActions
                trackImpression={false}
              />
            ))}
          </PuzzleRail>
        )}
      </section>

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Owned ({profile.owned.length})
        </h2>
        {profile.owned.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No purchases yet. Browse the <Link href="/open">Open Lane</Link>.
          </p>
        ) : (
          <PuzzleRail>
            {profile.owned.map((item) => (
              <WorkCard
                key={item.purchaseId}
                listing={item.listing}
                bucket="sold"
                showActions={false}
                trackImpression={false}
                footer={
                  <>
                    Collected {new Date(item.purchasedAt).toLocaleDateString()} · $
                    {item.amountUsd}
                    {item.txHash ? ` · ${item.txHash.slice(0, 10)}…` : ""}
                  </>
                }
              />
            ))}
          </PuzzleRail>
        )}
      </section>

      <section style={{ marginBottom: "2.75rem" }}>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Shelves ({profile.shelves.length})
        </h2>
        {profile.shelves.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No shelves yet. Curate from <Link href="/studio">Studio</Link>.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {profile.shelves.map((shelf) => (
              <div
                key={shelf.id}
                style={{
                  border: "1px solid var(--line)",
                  padding: "0.9rem 1rem",
                  background: "var(--panel)",
                }}
              >
                <div className="display" style={{ fontSize: "1.15rem" }}>
                  {shelf.name}
                </div>
                <p style={{ margin: "0.25rem 0 0", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
                  {shelf.listingIds.length} works · {shelf.followerCount} followers ·{" "}
                  <Link href="/shelves">View shelves</Link>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Recent bridges
        </h2>
        {profile.bridges.length === 0 ? (
          <p style={{ color: "var(--ink-muted)" }}>
            No bridge transfers yet. <Link href="/bridge">Move funds</Link>.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
            {profile.bridges.map((b) => {
              const from = isNetworkId(b.fromNetwork)
                ? getNetwork(b.fromNetwork).label
                : b.fromNetwork;
              const to = isNetworkId(b.toNetwork)
                ? getNetwork(b.toNetwork).label
                : b.toNetwork;
              return (
                <li
                  key={b.id}
                  style={{
                    border: "1px solid var(--line)",
                    padding: "0.75rem 0.9rem",
                    color: "var(--ink-muted)",
                    fontSize: "0.9rem",
                  }}
                >
                  {b.amount} · {from} → {to} · {b.status} ·{" "}
                  {new Date(b.createdAt).toLocaleString()}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
