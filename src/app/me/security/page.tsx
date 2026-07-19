import { SecuritySettingsPanel } from "@/components/SecuritySettingsPanel";
import { getSessionUser } from "@/lib/auth/session";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MeSecurityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/create");

  return (
    <div style={{ padding: "2.5rem clamp(1rem, 4vw, 3rem) 4rem" }}>
      <p style={{ margin: "0 0 0.75rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        <Link href="/me">← Account</Link>
      </p>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.2rem" }}>
        Security
      </h1>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.5rem", maxWidth: "48ch" }}>
        Protect {user.displayName} with authenticator-based 2FA. Wallet signatures
        still prove control of keys; 2FA adds a second factor on every login.
      </p>
      <SecuritySettingsPanel totpEnabled={user.totpEnabled} />
    </div>
  );
}
