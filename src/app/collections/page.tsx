import { CollectionsExplorer } from "@/components/CollectionsExplorer";
import { HowItWorksNote } from "@/components/HowItWorksNote";
import {
  COLLECTIONS_VIEW_COOKIE,
  parseCollectionsView,
} from "@/lib/collections-view";
import { listClosedPrimarySaleIds } from "@/lib/marketplace/sales";
import { getDiscoveryEngine } from "@/lib/marketplace/service";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const viewCookie = (await cookies()).get(COLLECTIONS_VIEW_COOKIE)?.value;
  const engine = await getDiscoveryEngine();
  const soldIds = await listClosedPrimarySaleIds();
  const collections = [...engine.state.collections.values()];
  const items = collections.map((collection) => {
    const surface = engine.getCollectionSurface(collection.id);
    const creator = engine.state.creators.get(collection.creatorId);
    return {
      id: collection.id,
      title: collection.title,
      creatorId: collection.creatorId,
      creatorName: creator?.displayName ?? collection.creatorId,
      chain: collection.chain,
      totalItems: collection.totalItems,
      heroListingId: collection.heroListingId,
      listings: surface?.listings ?? [],
    };
  });

  return (
    <div className="page-wrap">
      <CollectionsExplorer
        items={items}
        soldIds={[...soldIds]}
        initialView={parseCollectionsView(viewCookie)}
      >
        <HowItWorksNote kind="create" />
      </CollectionsExplorer>
    </div>
  );
}
