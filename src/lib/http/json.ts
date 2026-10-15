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
