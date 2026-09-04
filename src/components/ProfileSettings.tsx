"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  padding: "0.55rem 0.7rem",
  marginTop: "0.35rem",
};

export function ProfileSettings({
  displayName,
  email,
  hasPassword,
  googleLinked,
  googleEnabled,
}: {
  displayName: string;
  email: string | null;
  hasPassword: boolean;
  googleLinked: boolean;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "update_failed");
      setOk("Display name saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function attachCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/auth/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "attach_failed");
      setOk("Email and password added");
      e.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "attach_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginBottom: "2.75rem" }}>
      <h2 className="display" style={{ margin: "0 0 0.75rem", fontSize: "1.45rem" }}>
        Profile
      </h2>
      <div
        style={{
          display: "grid",
          gap: "1.1rem",
          maxWidth: "28rem",
          border: "1px solid var(--line)",
          padding: "1.1rem",
          background: "var(--panel)",
        }}
      >
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>
          {email ? email : "No email on this profile yet"}
          {googleLinked ? " · Google linked" : ""}
          {hasPassword ? " · password set" : ""}
        </p>

        <form onSubmit={(e) => void saveName(e)} style={{ display: "grid", gap: "0.6rem" }}>
          <label>
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              required
              style={fieldStyle}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="badge"
            style={{ cursor: "pointer", background: "transparent", justifySelf: "start" }}
          >
            Save name
          </button>
        </form>

        {!hasPassword ? (
          <form
            onSubmit={(e) => void attachCredentials(e)}
            style={{ display: "grid", gap: "0.6rem" }}
          >
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink-muted)" }}>
              Add email and password so you can sign in without a wallet.
            </p>
            <label>
              Email
              <input
                name="email"
                type="email"
                defaultValue={email ?? ""}
                required
                style={fieldStyle}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                style={fieldStyle}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="badge"
              style={{ cursor: "pointer", background: "transparent", justifySelf: "start" }}
            >
              Save login
            </button>
          </form>
        ) : null}

        {!googleLinked && googleEnabled ? (
          <a href="/api/auth/google?intent=link&next=/me/settings" className="badge featured">
            Link Google
          </a>
        ) : null}

        {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        {ok ? <p style={{ color: "var(--emergent)", margin: 0 }}>{ok}</p> : null}
      </div>
    </section>
  );
}
