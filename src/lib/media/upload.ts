import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "text/plain",
]);

export interface StoredMedia {
  mediaUrl: string;
  mediaHash: string;
  mimeType: string;
  size: number;
  fileName: string;
}

export async function storeUploadedMedia(file: File): Promise<StoredMedia> {
  if (file.size <= 0) throw new Error("empty_file");
  if (file.size > MAX_BYTES) throw new Error("file_too_large");
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED.has(mimeType)) throw new Error("unsupported_type");

  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaHash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const ext =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/jpeg"
        ? "jpg"
        : mimeType === "image/webp"
          ? "webp"
          : mimeType === "image/gif"
            ? "gif"
            : mimeType === "image/svg+xml"
              ? "svg"
              : "bin";

  const fileName = `${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), bytes);

  return {
    mediaUrl: `/uploads/${fileName}`,
    mediaHash,
    mimeType,
    size: bytes.length,
    fileName,
  };
}

export function hashTextMedia(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}
