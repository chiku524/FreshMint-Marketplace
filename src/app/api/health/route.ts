import { ensureDatabaseReady } from "@/lib/db-ready";
import { isMemoryMode } from "@/lib/data/memory-store";
import { getDatabaseUrl, getSqliteFilesystemPath } from "@/lib/env";
import { NextResponse } from "next/server";

export async function GET() {
  const mode = await ensureDatabaseReady();
  return NextResponse.json({
    ok: true,
    mode: isMemoryMode() ? "memory" : mode,
    databaseUrlHost: getDatabaseUrl().startsWith("file:")
      ? "sqlite-file"
      : "remote",
    sqlitePath: getSqliteFilesystemPath(),
    vercel: Boolean(process.env.VERCEL),
    timestamp: new Date().toISOString(),
  });
}
