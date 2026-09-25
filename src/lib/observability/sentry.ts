/**
 * Optional Sentry. No-ops when SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN unset.
 */
type SentryLike = {
  captureException: (err: unknown, hint?: { tags?: Record<string, string>; extra?: Record<string, unknown> }) => void;
};

let client: SentryLike | null | undefined;

async function getClient(): Promise<SentryLike | null> {
  if (client !== undefined) return client;
  const dsn =
    process.env.SENTRY_DSN?.trim() ||
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    client = null;
    return null;
  }
  try {
    // Dynamic import keeps builds working without the package until installed.
    const Sentry = await import("@sentry/nextjs");
    if (!(globalThis as { __fmSentryInit?: boolean }).__fmSentryInit) {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.05,
        enabled: true,
      });
      (globalThis as { __fmSentryInit?: boolean }).__fmSentryInit = true;
    }
    client = Sentry;
    return client;
  } catch {
    client = null;
    return null;
  }
}

export async function captureCheckoutError(
  err: unknown,
  context: {
    route?: string;
    listingId?: string;
    userId?: string;
    code?: string;
  },
): Promise<void> {
  const s = await getClient();
  if (!s) return;
  try {
    s.captureException(err, {
      tags: {
        area: "checkout",
        ...(context.route ? { route: context.route } : {}),
        ...(context.code ? { code: context.code } : {}),
      },
      extra: {
        listingId: context.listingId,
        userId: context.userId,
      },
    });
  } catch {
    // never throw from telemetry
  }
}
