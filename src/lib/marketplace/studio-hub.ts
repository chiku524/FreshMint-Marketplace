/**
 * Studio creator hub: collections with publish lifecycle + next-action CTAs.
 * Complements public /me (minted-only) by surfacing incomplete publishes.
 */

import type { Collection, Listing } from "@/lib/discovery/types";
import { getNetwork, resolveNetwork } from "@/lib/chains/registry";
import { collectionHref } from "@/lib/marketplace/collection-slug";
import {
  buildCollectionPublishLifecycle,
  isCollectionDeployed,
  isListingMinted,
  type PublishPhaseId,
  type PublishLifecycleSnapshot,
} from "@/lib/marketplace/publish-status";

export type StudioNextActionId =
  | "add_works"
  | "finish_publish"
  | "view_live"
  | "edit"
  | "create_new";

export type StudioNextAction = {
  id: StudioNextActionId;
  label: string;
  href: string;
  primary?: boolean;
};

export type StudioCollectionRow = {
  id: string;
  title: string;
  slug?: string | null;
  href: string;
  networkLabel: string;
  coverUrl: string | null;
  deployStatus: string;
  contractAddress: string | null;
  draftCount: number;
  unmintedDraftCount: number;
  mintedDraftCount: number;
  liveCount: number;
  phase: PublishPhaseId;
  phaseLabel: string;
  summary: string;
  lifecycle: PublishLifecycleSnapshot;
  needsAttention: boolean;
  primaryAction: StudioNextAction;
  secondaryActions: StudioNextAction[];
  sortAt: number;
};

function phaseLabel(phase: PublishPhaseId, row: {
  mintedDraftCount: number;
  liveCount: number;
  draftCount: number;
  deployStatus: string;
}): string {
  if (row.deployStatus === "failed") return "Deploy failed";
  if (row.deployStatus === "pending_wallet") return "Deploy pending";
  if (phase === "draft") {
    return row.draftCount === 0 ? "Empty draft" : "Draft";
  }
  if (phase === "deploy") return "Needs deploy";
  if (phase === "mint") return "Needs mint";
  if (row.mintedDraftCount > 0 && row.liveCount === 0) return "Ready to launch";
  if (row.mintedDraftCount > 0) return "Partial live";
  return "Live";
}

function buildActions(input: {
  collection: Collection;
  href: string;
  deployed: boolean;
  draftCount: number;
  unmintedDraftCount: number;
  mintedDraftCount: number;
  liveCount: number;
}): { primary: StudioNextAction; secondary: StudioNextAction[] } {
  const { collection, href } = input;
  const addWorks: StudioNextAction = {
    id: "add_works",
    label: "Add works",
    href: `/create?collectionId=${encodeURIComponent(collection.id)}`,
  };
  const finish: StudioNextAction = {
    id: "finish_publish",
    label:
      input.mintedDraftCount > 0 && input.unmintedDraftCount === 0
        ? "Soft-launch"
        : input.unmintedDraftCount > 0
          ? "Mint & publish"
          : "Finish publish",
    href,
    primary: true,
  };
  const viewLive: StudioNextAction = {
    id: "view_live",
    label: "Open collection",
    href,
    primary: true,
  };
  const edit: StudioNextAction = {
    id: "edit",
    label: "Manage",
    href,
  };

  // Incomplete publish work takes priority over "view live".
  if (input.draftCount > 0) {
    return {
      primary: finish,
      secondary: [
        addWorks,
        ...(input.liveCount > 0
          ? [{ ...viewLive, primary: false, label: "View live" }]
          : []),
      ],
    };
  }

  if (!input.deployed && input.liveCount === 0) {
    return {
      primary: { ...addWorks, primary: true, label: "Continue setup" },
      secondary: [edit],
    };
  }

  if (input.liveCount > 0) {
    return {
      primary: viewLive,
      secondary: [addWorks, edit],
    };
  }

  return {
    primary: { ...addWorks, primary: true },
    secondary: [edit],
  };
}

/**
 * Build Studio rows for every collection the creator owns (including unpublished).
 * Sorted: needs attention first, then most recently touched.
 */
export function buildStudioCollectionRows(input: {
  collections: Collection[];
  listings: Listing[];
}): StudioCollectionRow[] {
  const rows = input.collections.map((collection) => {
    const inCollection = input.listings.filter(
      (l) => l.collectionId === collection.id && !l.delisted,
    );
    const drafts = inCollection.filter((l) => l.stage === "draft");
    const live = inCollection.filter((l) => l.stage !== "draft");
    const mintedDrafts = drafts.filter((l) => isListingMinted(l));
    const unmintedDrafts = drafts.filter((l) => !isListingMinted(l));
    const deployed = isCollectionDeployed(collection);

    const lifecycle = buildCollectionPublishLifecycle({
      deployStatus: collection.deployStatus ?? "none",
      contractAddress: collection.contractAddress,
      draftCount: drafts.length,
      mintedDraftCount: mintedDrafts.length,
      unmintedDraftCount: unmintedDrafts.length,
      liveCount: live.length,
    });

    const href = collectionHref(collection);
    const { primary, secondary } = buildActions({
      collection,
      href,
      deployed,
      draftCount: drafts.length,
      unmintedDraftCount: unmintedDrafts.length,
      mintedDraftCount: mintedDrafts.length,
      liveCount: live.length,
    });

    const cover =
      collection.imageUrl ||
      live.find((l) => l.mediaUrl)?.mediaUrl ||
      drafts.find((l) => l.mediaUrl)?.mediaUrl ||
      null;

    const latestListingAt = inCollection.reduce(
      (max, l) => Math.max(max, l.createdAt ?? 0),
      0,
    );

    const needsAttention =
      collection.deployStatus === "failed" ||
      collection.deployStatus === "pending_wallet" ||
      drafts.length > 0 ||
      (!deployed && live.length === 0);

    return {
      id: collection.id,
      title: collection.title,
      slug: collection.slug,
      href,
      networkLabel: getNetwork(
        resolveNetwork(collection.network, collection.chain),
      ).label,
      coverUrl: cover,
      deployStatus: collection.deployStatus ?? "none",
      contractAddress: collection.contractAddress ?? null,
      draftCount: drafts.length,
      unmintedDraftCount: unmintedDrafts.length,
      mintedDraftCount: mintedDrafts.length,
      liveCount: live.length,
      phase: lifecycle.current,
      phaseLabel: phaseLabel(lifecycle.current, {
        mintedDraftCount: mintedDrafts.length,
        liveCount: live.length,
        draftCount: drafts.length,
        deployStatus: collection.deployStatus ?? "none",
      }),
      summary: lifecycle.summary,
      lifecycle,
      needsAttention,
      primaryAction: primary,
      secondaryActions: secondary,
      sortAt: Math.max(latestListingAt, collection.createdAt ?? 0),
    } satisfies StudioCollectionRow;
  });

  return rows.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) {
      return a.needsAttention ? -1 : 1;
    }
    return b.sortAt - a.sortAt;
  });
}

export function countStudioAttention(rows: StudioCollectionRow[]): number {
  return rows.filter((r) => r.needsAttention).length;
}
