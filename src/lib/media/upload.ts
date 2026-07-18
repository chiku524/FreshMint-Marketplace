import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

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
  storage: "vercel-blob" | "local";
}

function extFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/svg+xml") return "svg";
  return "bin";
}

async function storeLocal(
  bytes: Buffer,
  fileName: string,
  mimeType: string,
  mediaHash: string,
): Promise<StoredMedia> {
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), bytes);
  return {
    mediaUrl: `/uploads/${fileName}`,
    mediaHash,
    mimeType,
    size: bytes.length,
    fileName,
    storage: "local",
  };
}

export async function storeUploadedMedia(file: File): Promise<StoredMedia> {
  if (file.size <= 0) throw new Error("empty_file");
  if (file.size > MAX_BYTES) throw new Error("file_too_large");
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED.has(mimeType)) throw new Error("unsupported_type");

  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaHash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const fileName = `${Date.now()}-${randomBytes(4).toString("hex")}.${extFor(mimeType)}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`freshmint/${fileName}`, bytes, {
      access: "public",
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return {
      mediaUrl: blob.url,
      mediaHash,
      mimeType,
      size: bytes.length,
      fileName,
      storage: "vercel-blob",
    };
  }

  return storeLocal(bytes, fileName, mimeType, mediaHash);
}

export function hashTextMedia(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}
