import { CollectionsExplorer } from "@/components/CollectionsExplorer";
import {
  COLLECTIONS_VIEW_COOKIE,
  parseCollectionsView,
} from "@/lib/collections-view";
import { listTopCollectionsForIndex } from "@/lib/marketplace/collections-browse";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Collections",
  description:
    "Browse creator collections with at least $1,000 all-time completed primary volume.",
};

export default async function CollectionsPage() {
  const viewCookie = (await cookies()).get(COLLECTIONS_VIEW_COOKIE)?.value;
  const [items, soldIds] = await Promise.all([
    listTopCollectionsForIndex(),
    listClosedPrimarySaleIds(),
  ]);

  return (
    <div className="page-wrap">
      <CollectionsExplorer
        items={items}
        soldIds={[...soldIds]}
        initialView={parseCollectionsView(viewCookie)}
        lane="top"
      />
    </div>
  );
}
