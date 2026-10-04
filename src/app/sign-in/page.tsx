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
      <header className="page-lead">
        <h1 className="display page-lead__title">Sign in</h1>
        <p className="page-lead__copy">
          Use Google or email to open your profile, then link wallets from Settings.
        </p>
      </header>
      {user && (params.error || params.switch === "1") ? (
        <p className="fm-form-note" style={{ marginBottom: "1rem" }}>
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
      <p className="fm-form-note" style={{ marginTop: "1.15rem" }}>
        No account yet?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(nextPath)}`}>Create a profile</Link>, or{" "}
        <Link href="/">browse without one</Link>.
      </p>
    </div>
  );
}
