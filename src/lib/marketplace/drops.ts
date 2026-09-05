import type { Collection, DropKind, Listing, NftTrait } from "@/lib/discovery/types";

export const COLLECTION_MEDIA_CAP_BYTES = 10 * 1024 * 1024 * 1024;
export const DROP_FILE_MAX_BYTES = 100 * 1024 * 1024;

export type DropWindowState = "none" | "upcoming" | "live" | "ended";

export function parseTraits(value: unknown): NftTrait[] {
  if (!Array.isArray(value)) return [];
  const traits: NftTrait[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { trait_type?: unknown; value?: unknown };
    const trait_type = String(row.trait_type ?? "").trim().slice(0, 48);
    const traitValue = String(row.value ?? "").trim().slice(0, 80);
    if (!trait_type || !traitValue) continue;
    traits.push({ trait_type, value: traitValue });
    if (traits.length >= 24) break;
  }
  return traits;
}

export function parseDropKind(value: string | null | undefined): DropKind {
  return value === "limited" || value === "open" || value === "none"
    ? value
    : "none";
}

export function primarySupplyCap(listing: {
  type: string;
  maxSupply?: number | null;
}): number | null {
  if (listing.maxSupply != null && listing.maxSupply > 0) {
    return listing.maxSupply;
  }
  if (listing.type === "open_edition") return null;
  return 1;
}

export function dropWindowFor(
  listing: Pick<Listing, "type" | "oeStartsAt" | "oeEndsAt" | "auctionStartsAt" | "auctionEndsAt">,
  collection?: Pick<Collection, "dropKind" | "dropStartsAt" | "dropEndsAt"> | null,
  now = Date.now(),
): { start: number | null; end: number | null; state: DropWindowState } {
  let start: number | null = listing.oeStartsAt ?? null;
  let end: number | null = listing.oeEndsAt ?? null;
  if (listing.type === "auction") {
    start = listing.auctionStartsAt ?? start;
    end = listing.auctionEndsAt ?? end;
  }
  if (
    (start == null || end == null) &&
    collection &&
    collection.dropKind &&
    collection.dropKind !== "none"
  ) {
    start = collection.dropStartsAt ?? start;
    end = collection.dropEndsAt ?? end;
  }
  if (start == null && end == null) {
    return { start: null, end: null, state: "none" };
  }
  if (start != null && now < start) {
    return { start, end, state: "upcoming" };
  }
  if (end != null && now > end) {
    return { start, end, state: "ended" };
  }
  return { start, end, state: "live" };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
