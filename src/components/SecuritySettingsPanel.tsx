"use client";

import { useState } from "react";

export function SecuritySettingsPanel({
  totpEnabled: initialEnabled,
}: {
  totpEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{
    qrDataUrl: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");

  async function startEnroll() {
    setBusy(true);
    setError(null);
    setBackupCodes(null);
    try {
      const res = await fetch("/api/auth/2fa/enroll", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "enroll_failed");
      setEnroll({ qrDataUrl: data.qrDataUrl, secret: data.secret });
    } catch (e) {
      setError(e instanceof Error ? e.message : "enroll_failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "confirm_failed");
      setEnabled(true);
      setEnroll(null);
      setCode("");
      setBackupCodes(data.backupCodes as string[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "confirm_failed");
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "disable_failed");
      setEnabled(false);
      setDisableCode("");
      setBackupCodes(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "disable_failed");
    } finally {
      setBusy(false);
    }
  }

  async function regenerateBackups() {
    const codeInput = window.prompt("Enter your current authenticator code");
    if (!codeInput) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/backup/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "regenerate_failed");
      setBackupCodes(data.backupCodes as string[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "regenerate_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="me-section">
      <h2 className="display me-section__title">Two-factor authentication</h2>
      <div className="fm-form-surface fm-form-surface--wide fm-form-stack fm-form-stack--wide">
        <div>
          <p className="fm-form-note">
            Status:{" "}
            <span className={enabled ? "badge emerging" : "badge"}>
              {enabled ? "Enabled" : "Off"}
            </span>
          </p>
          <p className="fm-form-note" style={{ marginTop: "0.6rem" }}>
            Authenticator apps (Google Authenticator, 1Password, Authy) plus one-time
            backup codes. Required at every wallet or demo sign-in once enabled.
          </p>
        </div>

        {!enabled && !enroll ? (
          <div className="fm-form-actions">
            <button
              type="button"
              className="fm-btn fm-btn--primary"
              disabled={busy}
              onClick={() => void startEnroll()}
            >
              {busy ? "Preparing…" : "Enable 2FA"}
            </button>
          </div>
        ) : null}

        {enroll ? (
          <form onSubmit={(e) => void confirmEnroll(e)} className="fm-form-stack">
            <p className="fm-form-note">
              Scan this QR with your authenticator, or enter the secret manually.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enroll.qrDataUrl}
              alt="2FA QR code"
              width={220}
              height={220}
              style={{ border: "1px solid var(--line)", borderRadius: "0.4rem" }}
            />
            <code
              style={{
                fontSize: "0.85rem",
                wordBreak: "break-all",
                color: "var(--accent-soft)",
              }}
            >
              {enroll.secret}
            </code>
            <label>
              Confirm with a 6-digit code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="fm-field fm-field--code"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            <div className="fm-form-actions">
              <button type="submit" disabled={busy} className="fm-btn fm-btn--primary">
                Confirm & enable
              </button>
            </div>
          </form>
        ) : null}

        {enabled ? (
          <form onSubmit={(e) => void disable(e)} className="fm-form-stack">
            <label>
              Disable 2FA (code or backup)
              <input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                className="fm-field fm-field--code"
              />
            </label>
            <div className="fm-form-actions">
              <button
                type="submit"
                disabled={busy}
                className="fm-btn fm-btn--ghost"
                style={{ color: "var(--danger)" }}
              >
                Disable
              </button>
              <button
                type="button"
                disabled={busy}
                className="fm-btn fm-btn--ghost"
                onClick={() => void regenerateBackups()}
              >
                Regenerate backup codes
              </button>
            </div>
          </form>
        ) : null}

        {backupCodes ? (
          <div
            style={{
              border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
              borderRadius: "0.45rem",
              padding: "0.9rem",
              background: "color-mix(in srgb, var(--accent) 6%, transparent)",
            }}
          >
            <p className="fm-form-note" style={{ color: "var(--accent-soft)", marginBottom: "0.5rem" }}>
              Save these backup codes now — they won’t be shown again.
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.1rem", fontFamily: "monospace" }}>
              {backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <p className="fm-form-error">{error}</p> : null}
      </div>
    </section>
  );
}
