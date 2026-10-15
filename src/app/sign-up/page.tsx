import { AccountAuthForm } from "@/components/AccountAuthForm";
import { isGoogleAuthConfigured } from "@/lib/auth/google";
import { safeNextPath } from "@/lib/auth/paths";
import { getSessionUser } from "@/lib/auth/session";
import { noIndexMetadata } from "@/lib/seo/site";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = noIndexMetadata("Sign up");

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const user = await getSessionUser();
  if (user && !params.error) redirect(nextPath);

  return (
    <div className="page-wrap">
      <header className="page-lead">
        <h1 className="display page-lead__title">Create a profile</h1>
        <p className="page-lead__copy">
          Start with Google or email. Connect wallets from your profile after you
          are in.
        </p>
      </header>
      <AccountAuthForm
        mode="sign-up"
        nextPath={nextPath}
        googleEnabled={isGoogleAuthConfigured()}
        initialError={params.error}
      />
      <p className="fm-form-note" style={{ marginTop: "1.15rem" }}>
        <Link href="/sign-in">Already have a profile?</Link>
      </p>
    </div>
  );
}
