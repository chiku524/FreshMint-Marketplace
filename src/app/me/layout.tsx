import { AccountTabs } from "@/components/AccountTabs";
import { getSessionUser } from "@/lib/auth/session";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/me");

  return (
    <div className="page-wrap">
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
          {user.displayName}
        </h1>
        <Link href={`/creators/${user.id}`} className="badge">
          Public profile
        </Link>
      </div>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.25rem", maxWidth: "52ch" }}>
        Role: {user.role} · curator score {user.curatorScore}
        {user.verifiedCreator ? " · verified" : ""}
        {user.establishedBadge ? " · established" : ""}
        {user.totpEnabled ? " · 2FA on" : ""}.
      </p>
      <AccountTabs />
      {children}
    </div>
  );
}
