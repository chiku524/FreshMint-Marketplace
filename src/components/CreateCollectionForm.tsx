"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  padding: "0.55rem 0.7rem",
  marginTop: "0.35rem",
};

export function CreateCollectionForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    setOk(null);
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(fd.get("title")),
          network: String(fd.get("network")),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          (data.errors && data.errors.join(", ")) || data.error || "failed",
        );
      }
      setOk(`Collection “${data.collection.title}” is ready`);
      form.reset();
      router.refresh();
      window.dispatchEvent(new Event("fm-collections-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: "grid",
        gap: "0.9rem",
        border: "1px solid var(--line)",
        padding: "1.25rem",
        background: "var(--panel)",
      }}
    >
      <div>
        <label>
          Collection title
          <input name="title" required maxLength={120} style={fieldStyle} />
        </label>
      </div>
      <label>
        Mint network
        <select name="network" defaultValue="ethereum" style={fieldStyle}>
          <option value="ethereum">Ethereum (Sepolia)</option>
          <option value="base">Base (Sepolia)</option>
          <option value="arbitrum">Arbitrum (Sepolia)</option>
          <option value="optimism">Optimism (Sepolia)</option>
          <option value="solana">Solana (Devnet)</option>
          <option value="boing">Boing Testnet</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="badge featured"
        style={{
          cursor: "pointer",
          background: "transparent",
          justifySelf: "start",
          padding: "0.55rem 0.9rem",
        }}
      >
        {busy ? "Working…" : "Create collection"}
      </button>
      {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
      {ok ? <p style={{ color: "var(--emergent)", margin: 0 }}>{ok}</p> : null}
    </form>
  );
}
