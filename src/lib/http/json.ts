import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Parse a JSON request body without throwing. Malformed or empty bodies
 * resolve to `undefined`, so zod `safeParse` reports them as a 400 instead of
 * the route crashing with an unhandled 500.
 */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** Standard API error body: `{ error: code, ...details }`. */
export function apiError(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: code, ...details }, { status });
}

/**
 * 400 for a failed zod parse. Keeps the existing `error: "invalid_body"` code
 * and adds field-level `issues` so clients can show which field was wrong.
 */
export function invalidBody(error?: z.ZodError): NextResponse {
  const issues = error?.issues.slice(0, 20).map((i) => ({
    path: i.path.map(String).join("."),
    message: i.message,
  }));
  return apiError("invalid_body", 400, issues?.length ? { issues } : undefined);
}