import { SecuritySettingsPanel } from "@/components/SecuritySettingsPanel";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MeSecurityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/me/security");

  return (
    <>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.5rem", maxWidth: "48ch" }}>
        Protect {user.displayName} with authenticator-based 2FA. Wallet signatures
        still prove control of keys; 2FA adds a second factor on every login.
      </p>
      <SecuritySettingsPanel totpEnabled={user.totpEnabled} />
    </>
  );
}
