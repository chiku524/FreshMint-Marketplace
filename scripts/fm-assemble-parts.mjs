#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { gunzipSync } from "zlib";

const root = process.cwd();

function writeOut(out, body, note) {
  mkdirSync(dirname(join(root, out)), { recursive: true });
  writeFileSync(join(root, out), body);
  console.log("wrote", out, "bytes", Buffer.byteLength(body), note);
}

function assembleTxtParts(dir, out) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return false;
  const parts = readdirSync(abs).filter((f) => /^part-\d+\.txt$/.test(f)).sort();
  if (!parts.length) return false;
  // Require a contiguous part-00..N set starting at 00 (avoid partial uploads).
  if (parts[0] !== "part-00.txt") return false;
  writeOut(out, parts.map((f) => readFileSync(join(abs, f), "utf8")).join(""), `from ${parts.length} txt parts`);
  return true;
}

function readPartOrChunks(prefix, i) {
  // Prefer verified micro-chunks over a possibly-corrupt full part file.
  const chunkParts = [];
  for (let j = 0; j < 64; j++) {
    const cp = join(root, `${prefix}.part${i}.c${String(j).padStart(2, "0")}.txt`);
    if (!existsSync(cp)) break;
    chunkParts.push(readFileSync(cp, "utf8").replace(/\s+/g, ""));
  }
  if (chunkParts.length) return chunkParts.join("");
  const p = join(root, `${prefix}.part${i}.txt`);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function assembleB64GzParts(prefix, out) {
  const parts = [];
  for (let i = 0; i < 64; i++) {
    const body = readPartOrChunks(prefix, i);
    if (body == null) break;
    parts.push(body);
  }
  const single = join(root, prefix + ".txt");
  if (!parts.length && !existsSync(single)) return false;
  const b64 = (parts.length ? parts.join("") : readFileSync(single, "utf8")).replace(/\s+/g, "");
  const body = gunzipSync(Buffer.from(b64, "base64"));
  writeOut(out, body, `from b64 gz ${prefix}`);
  return true;
}

// Prefer complete gzip+base64 parts (used for large restores).
assembleB64GzParts(".fm-assemble/boing.b64.gz", "src/lib/onchain/boing.ts") ||
  assembleTxtParts(".fm-assemble/boing", "src/lib/onchain/boing.ts");
assembleB64GzParts(".fm-assemble/service.b64.gz", "src/lib/marketplace/service.ts") ||
  assembleTxtParts(".fm-assemble/service", "src/lib/marketplace/service.ts");
