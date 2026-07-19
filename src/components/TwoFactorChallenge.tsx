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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "grid",
        placeItems: "center",
        background: "rgba(3, 5, 4, 0.72)",
        padding: "1rem",
      }}
    >
      <form
        onSubmit={(e) => void submit(e)}
        style={{
          width: "min(100%, 22rem)",
          padding: "1.35rem",
          border: "1px solid var(--line)",
          background: "var(--panel-solid)",
          display: "grid",
          gap: "0.85rem",
        }}
      >
        <div>
          <h2 className="display" style={{ margin: "0 0 0.35rem", fontSize: "1.35rem" }}>
            Two-factor check
          </h2>
          <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            Enter the 6-digit code from your authenticator for{" "}
            <strong style={{ color: "var(--ink)" }}>{displayName}</strong>, or a
            backup code.
          </p>
        </div>
        <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
          Authentication code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            style={{
              padding: "0.55rem 0.65rem",
              background: "var(--bg-deep)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              letterSpacing: "0.08em",
            }}
          />
        </label>
        {error ? (
          <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button
            type="submit"
            disabled={busy || code.trim().length < 6}
            className="badge featured"
            style={{
              cursor: "pointer",
              background: "transparent",
              padding: "0.5rem 0.85rem",
            }}
          >
            {busy ? "Checking…" : "Verify"}
          </button>
          <button
            type="button"
            className="badge"
            onClick={onCancel}
            style={{
              cursor: "pointer",
              background: "transparent",
              padding: "0.5rem 0.85rem",
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
