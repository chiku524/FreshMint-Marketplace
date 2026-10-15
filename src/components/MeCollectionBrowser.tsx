"use client";

import {
  ProfileWorksExplorer,
  type ProfileCollectionItem,
} from "@/components/ProfileWorksExplorer";
import type { ProfileViewId } from "@/lib/profile-view";
import type { ReactNode } from "react";

/**
 * Private /me Collection tab: minted/published collections are the primary
 * browse surface (gallery / grid / list). Pieces live on collection pages.
 */
export function MeCollectionBrowser({
  collections,
  initialView = "grid",
  creatorName,
  emptyCollections,
  trailing,
}: {
  collections: ProfileCollectionItem[];
  initialView?: ProfileViewId;
  creatorName?: string;
  emptyCollections?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <ProfileWorksExplorer
      collections={collections}
      initialView={initialView}
      creatorName={creatorName}
      emptyCollections={emptyCollections}
      title={`My collections (${collections.length})`}
      hint="Gallery, grid, or list for your minted collections. Open a set to manage pieces."
      trailing={trailing}
    />
  );
}
