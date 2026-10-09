#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function assemble(dir, outPath) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("part-") && f.endsWith(".txt"))
    .sort();
  if (!files.length) throw new Error(`no parts in ${dir}`);
  const body = files.map((f) => readFileSync(join(dir, f), "utf8")).join("");
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, body);
  console.log("wrote", outPath, body.length, "from", files.length, "parts");
}

assemble(".fm-assemble/boing", "src/lib/onchain/boing.ts");
assemble(".fm-assemble/service", "src/lib/marketplace/service.ts");
