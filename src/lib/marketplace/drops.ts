import type { Collection, DropKind, NftTrait } from "@/lib/discovery/types";

export const COLLECTION_MEDIA_CAP_BYTES = 10 * 1024 * 1024 * 1024;
export const DROP_FILE_MAX_BYTES = 100 * 1024 * 1024;

export type DropWindowState = "none" | "upcoming" | "live" | "ended";

const CSV_RESERVED = new Set([
  "name",
  "title",
  "description",
  "file_name",
  "filename",
  "file",
  "media",
  "image",
  "media_filename",
  "tokenid",
  "token_id",
  "edition",
  "supply",
  "max_supply",
  "maxsupply",
  "price",
  "price_usd",
  "priceusd",
]);

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
  listing: {
    type: string;
    oeStartsAt: number | null;
    oeEndsAt: number | null;
    auctionStartsAt: number | null;
    auctionEndsAt: number | null;
  },
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

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function traitTypeFromHeader(header: string): string | null {
  const trimmed = header.trim();
  if (!trimmed) return null;
  const attr = trimmed.match(/^attributes?\s*\[\s*(.+?)\s*\]$/i);
  if (attr) return attr[1].trim().slice(0, 48);
  const key = normalizeHeader(trimmed);
  if (CSV_RESERVED.has(key)) return null;
  return trimmed.slice(0, 48);
}

export type DropCsvRow = {
  fileName: string | null;
  title: string | null;
  description: string | null;
  maxSupply: number | null;
  traits: NftTrait[];
};

/** OpenSea-style metadata CSV: file_name + name/description + trait columns. */
export function parseDropMetadataCsv(text: string): DropCsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: DropCsvRow[] = [];

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    if (!cells.some((cell) => cell)) continue;

    let fileName: string | null = null;
    let title: string | null = null;
    let description: string | null = null;
    let maxSupply: number | null = null;
    const traits: NftTrait[] = [];

    headers.forEach((header, index) => {
      const raw = cells[index] ?? "";
      const value = raw.trim();
      const key = normalizeHeader(header);
      if (
        key === "file_name" ||
        key === "filename" ||
        key === "file" ||
        key === "media" ||
        key === "image" ||
        key === "media_filename"
      ) {
        fileName = value || null;
        return;
      }
      if (key === "name" || key === "title") {
        title = value || null;
        return;
      }
      if (key === "description") {
        description = value || null;
        return;
      }
      if (key === "supply" || key === "max_supply" || key === "maxsupply") {
        const n = Number(value);
        maxSupply = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
        return;
      }
      const traitType = traitTypeFromHeader(header);
      if (traitType && value) {
        traits.push({ trait_type: traitType, value: value.slice(0, 80) });
      }
    });

    rows.push({
      fileName,
      title,
      description,
      maxSupply,
      traits: parseTraits(traits),
    });
  }

  return rows;
}

export function matchDropCsvRow(
  rows: DropCsvRow[],
  item: { title: string; mediaUrl: string; fileHint?: string | null },
): DropCsvRow | null {
  const hint = (item.fileHint || item.mediaUrl.split("/").pop() || "")
    .split("?")[0]
    .toLowerCase();
  const titleKey = item.title.trim().toLowerCase();

  if (hint) {
    const byFile = rows.find((row) => {
      const name = (row.fileName || "").toLowerCase();
      return (
        name === hint ||
        name.replace(/\.[^.]+$/, "") === hint.replace(/\.[^.]+$/, "")
      );
    });
    if (byFile) return byFile;
  }

  if (titleKey) {
    return (
      rows.find((row) => (row.title || "").trim().toLowerCase() === titleKey) ??
      null
    );
  }
  return null;
}

export const DROP_METADATA_CSV_EXAMPLE = `file_name,name,description,Background,Eyes,Leaf
garden-01.png,Static Garden #1,First leaf study,Gold,Laser,Maple
garden-02.png,Static Garden #2,Second leaf study,Indigo,Calm,Oak
`;
