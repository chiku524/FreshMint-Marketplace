import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { DROP_FILE_MAX_BYTES } from "@/lib/marketplace/drops";

const MAX_BYTES = DROP_FILE_MAX_BYTES;
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
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
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
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

function mimeFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "mp4") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "txt") return "text/plain";
  return null;
}

export async function storeUploadedMedia(file: File): Promise<StoredMedia> {
  if (file.size <= 0) throw new Error("empty_file");
  if (file.size > MAX_BYTES) throw new Error("file_too_large");
  const mimeType =
    (file.type && ALLOWED.has(file.type) ? file.type : null) ||
    mimeFromName(file.name) ||
    "application/octet-stream";
  if (!ALLOWED.has(mimeType)) throw new Error("unsupported_type");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (mimeType === "image/svg+xml" && !isSafeSvg(bytes.toString("utf8"))) {
    throw new Error("unsafe_svg");
  }
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

/**
 * SVG is XML that can carry script. We keep accepting plain artwork SVGs (they
 * display through <img>, which never runs script) but reject files with active
 * content: script/foreignObject/iframe/embed elements, on* event handlers,
 * javascript:/data:text/html URLs, external entity tricks, or xlink to other
 * origins' scripts. Rejecting beats rewriting: we never store altered art.
 */
export function isSafeSvg(text: string): boolean {
  const t = text.toLowerCase();
  if (/<\s*(script|foreignobject|iframe|embed|object|handler)\b/.test(t)) return false;
  if (/\son[a-z]+\s*=/.test(t)) return false;
  if (/(javascript|vbscript)\s*:/.test(t)) return false;
  if (/data\s*:\s*text\/html/.test(t)) return false;
  if (/<!entity/.test(t)) return false;
  if (/<\s*set\b[^>]*attributename\s*=\s*["']?(href|xlink:href)/.test(t)) return false;
  return true;
}

export function hashTextMedia(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}
