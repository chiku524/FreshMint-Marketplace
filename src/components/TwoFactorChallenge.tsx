"use client";

import { useState } from "react";

export function TwoFactorChallenge({
  pendingToken,
  displayName,
  onSuccess,
  onCancel,
}: {
  pendingToken: string;
  displayName: string;
  onSuccess: (user: unknown) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "verify_failed");
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "verify_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fm-form-dialog-scrim">
      <form onSubmit={(e) => void submit(e)} className="fm-form-dialog">
        <div>
          <h2 className="display fm-form-dialog__title">Two-factor check</h2>
          <p className="fm-form-note">
            Enter the 6-digit code from your authenticator for{" "}
            <strong style={{ color: "var(--ink)" }}>{displayName}</strong>, or a
            backup code.
          </p>
        </div>
        <label className="fm-label">
          Authentication code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="fm-field fm-field--code"
          />
        </label>
        {error ? <p className="fm-form-error">{error}</p> : null}
        <div className="fm-form-actions">
          <button
            type="submit"
            disabled={busy || code.trim().length < 6}
            className="fm-btn fm-btn--primary"
          >
            {busy ? "Checking…" : "Verify"}
          </button>
          <button type="button" className="fm-btn fm-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
