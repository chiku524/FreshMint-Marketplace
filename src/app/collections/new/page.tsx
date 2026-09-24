import { CollectionsExplorer } from "@/components/CollectionsExplorer";
import {
  COLLECTIONS_VIEW_COOKIE,
  parseCollectionsView,
} from "@/lib/collections-view";
import { listNewCollectionsThisWeek } from "@/lib/marketplace/collections-browse";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New collections — FreshMint Marketplace",
  description:
    "Collections created in the last 7 days with at least one published work.",
};

export default async function NewCollectionsPage() {
  const viewCookie = (await cookies()).get(COLLECTIONS_VIEW_COOKIE)?.value;
  const [items, soldIds] = await Promise.all([
    listNewCollectionsThisWeek(),
    listClosedPrimarySaleIds(),
  ]);

  return (
    <div className="page-wrap">
      <CollectionsExplorer
        items={items}
        soldIds={[...soldIds]}
        initialView={parseCollectionsView(viewCookie)}
        lane="new"
      />
    </div>
  );
}
