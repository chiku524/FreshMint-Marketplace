/**
 * Thin Resend mailer. No-ops (logs once) when RESEND_API_KEY is unset
 * so production deploys never fail on missing email config.
 */
const loggedMissing = { current: false };

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Idempotency key forwarded to Resend when available. */
  idempotencyKey?: string;
};

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

export async function sendMail(
  input: SendMailInput,
): Promise<{ sent: boolean; skipped?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    if (!loggedMissing.current) {
      loggedMissing.current = true;
      console.info(
        "[mail] RESEND_API_KEY or EMAIL_FROM unset — transactional email skipped",
      );
    }
    return { sent: false, skipped: "not_configured" };
  }

  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { sent: false, skipped: "invalid_to" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey.slice(0, 256) }
          : {}),
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[mail] Resend error", res.status, body.slice(0, 200));
      return { sent: false, skipped: `resend_${res.status}` };
    }
    const data = (await res.json()) as { id?: string };
    return { sent: true, id: data.id };
  } catch (err) {
    console.warn("[mail] send failed", err);
    return { sent: false, skipped: "network_error" };
  }
}

export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://fresh-mint-marketplace.vercel.app"
  );
}
