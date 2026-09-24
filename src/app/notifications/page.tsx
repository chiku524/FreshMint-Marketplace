import { NotificationInbox } from "@/components/NotificationInbox";
import { getSessionUser } from "@/lib/auth/session";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications — FreshMint Marketplace",
};

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=/notifications");
  }

  return (
    <div className="page-wrap">
      <p style={{ margin: "0 0 1rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
        <Link href="/me">Profile</Link>
        {" · "}
        Notifications
      </p>
      <h1 className="display" style={{ margin: "0 0 0.5rem", fontSize: "2.2rem" }}>
        Notifications
      </h1>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 1.5rem", maxWidth: "48ch" }}>
        In-app alerts for bids, English auction awards, and sales. No email.
      </p>
      <NotificationInbox />
    </div>
  );
}
