import { AccountTabs } from "@/components/AccountTabs";
import { getSessionUser } from "@/lib/auth/session";
import { noIndexMetadata } from "@/lib/seo/site";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = noIndexMetadata(
  "Account",
  "Your FreshMint account, collection, and settings.",
);

export default async function MeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/me");

  return (
    <div className="page-wrap">
      <header className="me-shell__masthead">
        <div className="me-head">
          <h1 className="display me-head__title">{user.displayName}</h1>
          <Link href={`/creators/${user.id}`} className="fm-btn fm-btn--ghost">
            Public profile
          </Link>
        </div>
        <p className="me-head__meta">
          {[
            user.role !== "member" ? user.role : null,
            `${user.curatorScore} curator points`,
            user.verifiedCreator ? "verified" : null,
            user.establishedBadge ? "established" : null,
            user.totpEnabled ? "2FA on" : null,
          ]
            .filter(Boolean)
            .join(" \u00b7 ")}
        </p>
      </header>
      <AccountTabs />
      {children}
    </div>
  );
}
