import { AccountAuthForm } from "@/components/AccountAuthForm";
import { isGoogleAuthConfigured } from "@/lib/auth/google";
import { safeNextPath } from "@/lib/auth/paths";
import { getSessionUser } from "@/lib/auth/session";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const user = await getSessionUser();
  if (user) redirect(nextPath);

  return (
    <div className="page-wrap">
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.2rem" }}>
        Create a profile
      </h1>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.5rem", maxWidth: "48ch" }}>
        Start with Google or email. After you are in, connect wallets from your
        profile — they stay linked to this account.
      </p>
      <AccountAuthForm
        mode="sign-up"
        nextPath={nextPath}
        googleEnabled={isGoogleAuthConfigured()}
        initialError={params.error}
      />
      <p style={{ margin: "1.25rem 0 0", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        <Link href="/sign-in">Already have a profile?</Link>
      </p>
    </div>
  );
}
