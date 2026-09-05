import { ProfileSettings } from "@/components/ProfileSettings";
import { WalletLinkPanel } from "@/components/WalletLinkPanel";
import { isGoogleAuthConfigured } from "@/lib/auth/google";
import { getSessionUser } from "@/lib/auth/session";
import {
  getUserAssetProfile,
  profileFromSession,
} from "@/lib/marketplace/profile";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MeSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/me/settings");

  const profile =
    (await getUserAssetProfile(user.id)) ?? profileFromSession(user);

  return (
    <>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.75rem", maxWidth: "52ch" }}>
        Display name, sign-in methods, and linked wallets for this profile.
      </p>

      <ProfileSettings
        displayName={profile.displayName}
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
          another provider. NFTs in each linked address appear on Collection.
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
              gap: "0.45rem",
            }}
          >
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
        <WalletLinkPanel />
      </section>
    </>
  );
}
