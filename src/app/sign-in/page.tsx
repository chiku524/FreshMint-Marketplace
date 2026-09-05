import { AccountAuthForm } from "@/components/AccountAuthForm";
import { isGoogleAuthConfigured } from "@/lib/auth/google";
import { safeNextPath } from "@/lib/auth/paths";
import { getSessionUser } from "@/lib/auth/session";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    error?: string;
    challenge?: string;
    name?: string;
    switch?: string;
  }>;
}) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const user = await getSessionUser();
  if (user && !params.challenge && !params.error && params.switch !== "1") {
    redirect(nextPath);
  }

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.2rem" }}>
        Sign in
      </h1>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.5rem", maxWidth: "48ch" }}>
        Use Google or email to open your profile, then link EVM, Solana, or Boing
        wallets from Settings.
      </p>
      {user && (params.error || params.switch === "1") ? (
        <p style={{ color: "var(--ink-muted)", margin: "0 0 1rem", maxWidth: "48ch" }}>
          Still signed in as {user.displayName}.{" "}
          <Link href={`/api/auth/logout?next=${encodeURIComponent(`/sign-in?next=${encodeURIComponent(nextPath)}`)}`}>
            Sign out
          </Link>{" "}
          to use Google or another account.
        </p>
      ) : null}
      <AccountAuthForm
        mode="sign-in"
        nextPath={nextPath}
        googleEnabled={isGoogleAuthConfigured()}
        initialError={params.error}
        initialChallenge={params.challenge}
        initialName={params.name}
      />
      <p style={{ margin: "1.25rem 0 0", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        No account yet?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(nextPath)}`}>Create a profile</Link>, or{" "}
        <Link href="/">browse without one</Link>.
      </p>
    </div>
  );
}
