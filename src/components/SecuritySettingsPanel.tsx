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

  const field = {
    padding: "0.55rem 0.65rem",
    background: "var(--bg-deep)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
    width: "100%",
  } as const;

  return (
    <section
      style={{
        border: "1px solid var(--line)",
        background: "var(--panel)",
        padding: "1.25rem",
        display: "grid",
        gap: "1rem",
        maxWidth: "36rem",
      }}
    >
      <div>
        <h2 className="display" style={{ margin: "0 0 0.35rem", fontSize: "1.4rem" }}>
          Two-factor authentication
        </h2>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.95rem" }}>
          Status:{" "}
          <span className={enabled ? "badge emerging" : "badge"}>
            {enabled ? "Enabled" : "Off"}
          </span>
        </p>
        <p style={{ margin: "0.6rem 0 0", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          Authenticator apps (Google Authenticator, 1Password, Authy) plus one-time
          backup codes. Required at every wallet or demo sign-in once enabled.
        </p>
      </div>

      {!enabled && !enroll ? (
        <button
          type="button"
          className="badge featured"
          disabled={busy}
          onClick={() => void startEnroll()}
          style={{
            cursor: "pointer",
            background: "transparent",
            justifySelf: "start",
            padding: "0.55rem 0.9rem",
          }}
        >
          {busy ? "Preparing…" : "Enable 2FA"}
        </button>
      ) : null}

      {enroll ? (
        <form onSubmit={(e) => void confirmEnroll(e)} style={{ display: "grid", gap: "0.85rem" }}>
          <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            Scan this QR with your authenticator, or enter the secret manually.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enroll.qrDataUrl}
            alt="2FA QR code"
            width={220}
            height={220}
            style={{ border: "1px solid var(--line)" }}
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
          <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
            Confirm with a 6-digit code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={field}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="badge emerging"
            style={{
              cursor: "pointer",
              background: "transparent",
              justifySelf: "start",
              padding: "0.5rem 0.85rem",
            }}
          >
            Confirm & enable
          </button>
        </form>
      ) : null}

      {enabled ? (
        <>
          <form onSubmit={(e) => void disable(e)} style={{ display: "grid", gap: "0.65rem" }}>
            <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
              Disable 2FA (code or backup)
              <input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                style={field}
              />
            </label>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={busy}
                className="badge"
                style={{
                  cursor: "pointer",
                  background: "transparent",
                  padding: "0.5rem 0.85rem",
                  color: "var(--danger)",
                }}
              >
                Disable
              </button>
              <button
                type="button"
                disabled={busy}
                className="badge"
                onClick={() => void regenerateBackups()}
                style={{
                  cursor: "pointer",
                  background: "transparent",
                  padding: "0.5rem 0.85rem",
                }}
              >
                Regenerate backup codes
              </button>
            </div>
          </form>
        </>
      ) : null}

      {backupCodes ? (
        <div
          style={{
            border: "1px solid rgba(212, 174, 102, 0.35)",
            padding: "0.9rem",
            background: "rgba(212, 174, 102, 0.06)",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", color: "var(--accent-soft)", fontSize: "0.9rem" }}>
            Save these backup codes now — they won’t be shown again.
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontFamily: "monospace" }}>
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.9rem" }}>{error}</p>
      ) : null}
    </section>
  );
}
