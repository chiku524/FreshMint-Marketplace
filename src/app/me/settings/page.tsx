import { ProfileSettings } from "@/components/ProfileSettings";
import { UnlinkWalletButton } from "@/components/UnlinkWalletButton";
import { WalletLinkPanel } from "@/components/WalletLinkPanel";
import { isGoogleAuthConfigured } from "@/lib/auth/google";
import { getSessionUser } from "@/lib/auth/session";
import { getNetwork } from "@/lib/chains/registry";
import {
  getUserAssetProfile,
  profileFromSession,
} from "@/lib/marketplace/profile";
import { formatBoingBalanceUserMessage } from "@/lib/onchain/boing";
import { fetchBoingBalancesForWallets } from "@/lib/wallet/inventory";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function shortAddr(address: string): string {
  if (address.length < 18) return address;
  return `${address.slice(0, 10)}…${address.slice(-6)}`;
}

export default async function MeSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/me/settings");

  const profile =
    (await getUserAssetProfile(user.id)) ?? profileFromSession(user);
  const boingBalances = await fetchBoingBalancesForWallets(profile.wallets);
  const balanceByAddress = new Map(
    boingBalances.map((b) => [b.address.toLowerCase(), b]),
  );
  const primaryKey =
    profile.wallets.length > 0
      ? `${profile.wallets[0]!.chain}:${profile.wallets[0]!.address}`
      : null;

  return (
    <>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.75rem", maxWidth: "52ch" }}>
        Display name, sign-in methods, and linked wallets for this profile.
      </p>

      <ProfileSettings
        userId={profile.userId}
        displayName={profile.displayName}
        avatarUrl={profile.avatarUrl}
        bio={(profile as { bio?: string }).bio}
        websiteUrl={(profile as { websiteUrl?: string | null }).websiteUrl}
        twitterUrl={(profile as { twitterUrl?: string | null }).twitterUrl}
        farcasterUrl={(profile as { farcasterUrl?: string | null }).farcasterUrl}
        email={profile.email}
        hasPassword={profile.hasPassword}
        googleLinked={profile.googleLinked}
        googleEnabled={isGoogleAuthConfigured()}
      />

      <section>
        <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
          Wallets
        </h2>
        <p style={{ color: "var(--ink-muted)", margin: "0 0 0.85rem", maxWidth: "48ch" }}>
          Link EVM, Solana, or Boing by signing a message. If several EVM
          wallets are installed, you can pick Coinbase, MetaMask, Phantom, or
          another provider. Unlink removes the account connection only —
          listings and on-chain history for that address stay. NFTs in each
          linked address appear on Collection. Linked Boing wallets also show a
          live BOING balance here.
        </p>
        {profile.wallets.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", margin: "0 0 0.75rem" }}>
            No wallets linked yet.
          </p>
        ) : (
          <ul
            style={{
              margin: "0 0 0.9rem",
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: "0.55rem",
            }}
          >
            {profile.wallets.map((w) => {
              const bal =
                w.chain === "boing"
                  ? balanceByAddress.get(w.address.toLowerCase())
                  : undefined;
              const isPrimary =
                primaryKey === `${w.chain}:${w.address}`;
              return (
                <li
                  key={`${w.chain}-${w.address}`}
                  data-testid={
                    w.chain === "boing" ? "boing-wallet-settings-row" : "linked-wallet-row"
                  }
                  style={{
                    display: "grid",
                    gap: "0.4rem",
                    padding: "0.65rem 0.75rem",
                    border:
                      "1px solid color-mix(in srgb, var(--ink) 12%, transparent)",
                    background:
                      "color-mix(in srgb, var(--paper, var(--bg)) 92%, transparent)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "0.55rem",
                    }}
                  >
                    <div
                      className="badge"
                      style={{
                        justifySelf: "start",
                        fontFamily: "monospace",
                        whiteSpace: "normal",
                      }}
                    >
                      {w.network ?? w.chain}: {w.address}
                      {isPrimary ? (
                        <span
                          style={{
                            marginLeft: "0.4rem",
                            fontFamily: "inherit",
                            fontSize: "0.72rem",
                            opacity: 0.85,
                          }}
                        >
                          · Primary
                        </span>
                      ) : null}
                      {bal?.ok ? (
                        <>
                          {" · "}
                          <a
                            href={getNetwork("boing").explorerAddress(bal.address)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {bal.balance ?? "0"} BOING
                          </a>
                        </>
                      ) : bal && !bal.ok ? (
                        <>
                          {" · "}
                          <span style={{ opacity: 0.85 }}>balance not loaded</span>
                        </>
                      ) : null}
                      {w.chain === "boing" ? (
                        <span
                          style={{
                            display: "block",
                            fontSize: "0.75rem",
                            opacity: 0.8,
                            fontFamily: "inherit",
                            maxWidth: "48ch",
                            whiteSpace: "normal",
                          }}
                        >
                          {shortAddr(w.address)} · FreshMint NFT scan is catalog-scoped
                          {bal && !bal.ok
                            ? ` · ${formatBoingBalanceUserMessage(bal.error)}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                    <UnlinkWalletButton
                      chain={w.chain}
                      address={w.address}
                      label={w.network ?? w.chain}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <WalletLinkPanel />
      </section>
    </>
  );
}
