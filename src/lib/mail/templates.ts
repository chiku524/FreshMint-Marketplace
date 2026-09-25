import { appOrigin } from "@/lib/mail/resend";

function wrap(title: string, bodyHtml: string, href: string): string {
  const origin = appOrigin();
  return `<!doctype html>
<html><body style="font-family:Georgia,serif;background:#0b0b0c;color:#f4f1ea;padding:24px">
  <div style="max-width:520px;margin:0 auto;border:1px solid #2a2a2e;padding:20px;background:#121214">
    <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#9a958c;margin-bottom:12px">FreshMint</div>
    <h1 style="font-size:22px;margin:0 0 12px;font-weight:600">${title}</h1>
    <div style="font-size:15px;line-height:1.55;color:#d8d2c6">${bodyHtml}</div>
    <p style="margin:20px 0 0"><a href="${origin}${href}" style="color:#c8f07a">Open on FreshMint →</a></p>
  </div>
</body></html>`;
}

export function englishWinEmail(input: {
  listingTitle: string;
  amountUsd: number;
  deadlineLabel: string;
  href: string;
  cascaded?: boolean;
}): { subject: string; text: string; html: string } {
  const title = input.cascaded
    ? "You're next — complete payment"
    : "You won — complete payment";
  const subject = `${title}: ${input.listingTitle}`;
  const text = `${title}\n\n"${input.listingTitle}" at $${input.amountUsd}. Pay by ${input.deadlineLabel}.\n${appOrigin()}${input.href}\n`;
  const html = wrap(
    title,
    `<p>You ${input.cascaded ? "are next in line for" : "won"} <strong>${escapeHtml(input.listingTitle)}</strong> at <strong>$${input.amountUsd}</strong>.</p><p>Complete payment by <strong>${escapeHtml(input.deadlineLabel)}</strong> or the award may pass to the next bidder.</p>`,
    input.href,
  );
  return { subject, text, html };
}

export function englishExpiredEmail(input: {
  listingTitle: string;
  amountUsd: number;
  href: string;
}): { subject: string; text: string; html: string } {
  const subject = `Payment window expired: ${input.listingTitle}`;
  const text = `Your winning checkout for "${input.listingTitle}" ($${input.amountUsd}) expired.\n${appOrigin()}${input.href}\n`;
  const html = wrap(
    "Payment window expired",
    `<p>Your winning checkout for <strong>${escapeHtml(input.listingTitle)}</strong> ($${input.amountUsd}) expired. The award may pass to the next bidder.</p>`,
    input.href,
  );
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
