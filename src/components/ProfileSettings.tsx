"use client";

import { CreatorAvatar } from "@/components/CreatorAvatar";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  padding: "0.55rem 0.7rem",
  marginTop: "0.35rem",
};

export function ProfileSettings({
  userId,
  displayName,
  avatarUrl,
  bio: initialBio = "",
  websiteUrl: initialWebsite = null,
  twitterUrl: initialTwitter = null,
  farcasterUrl: initialFarcaster = null,
  email,
  hasPassword,
  googleLinked,
  googleEnabled,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio?: string;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  farcasterUrl?: string | null;
  email: string | null;
  hasPassword: boolean;
  googleLinked: boolean;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(displayName);
  const [photoUrl, setPhotoUrl] = useState<string | null>(avatarUrl);
  const [bio, setBio] = useState(initialBio);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsite ?? "");
  const [twitterUrl, setTwitterUrl] = useState(initialTwitter ?? "");
  const [farcasterUrl, setFarcasterUrl] = useState(initialFarcaster ?? "");
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

  async function patchAvatar(next: string | null) {
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: next }),
    });
    const data = (await res.json()) as { error?: string; avatarUrl?: string | null };
    if (!res.ok) throw new Error(data.error ?? "avatar_update_failed");
    setPhotoUrl(data.avatarUrl ?? next);
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const upload = await fetch("/api/media/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await upload.json()) as {
        error?: string;
        mediaUrl?: string;
      };
      if (upload.status === 401) throw new Error("sign_in");
      if (!upload.ok || !data.mediaUrl) {
        throw new Error(
          data.error === "unsupported_type"
            ? "Use PNG, JPEG, WebP, or GIF"
            : data.error === "file_too_large"
              ? "Image is too large"
              : (data.error ?? "upload_failed"),
        );
      }
      await patchAvatar(data.mediaUrl);
      setOk("Profile photo updated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload_failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearPhoto() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await patchAvatar(null);
      setOk("Profile photo cleared");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "avatar_update_failed");
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

        <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
          <CreatorAvatar
            id={userId}
            displayName={name || displayName}
            avatarUrl={photoUrl}
            size={64}
          />
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink-muted)" }}>
              Upload a square-ish photo (PNG, JPEG, WebP, GIF). Same pipeline as
              listing media.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              <button
                type="button"
                disabled={busy}
                className="badge"
                style={{ cursor: "pointer", background: "transparent" }}
                onClick={() => fileRef.current?.click()}
              >
                Upload photo
              </button>
              {photoUrl ? (
                <button
                  type="button"
                  disabled={busy}
                  className="badge"
                  style={{ cursor: "pointer", background: "transparent" }}
                  onClick={() => void clearPhoto()}
                >
                  Remove photo
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              setBusy(true);
              setError(null);
              setOk(null);
              try {
                const res = await fetch("/api/auth/profile", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    bio,
                    websiteUrl: websiteUrl || null,
                    twitterUrl: twitterUrl || null,
                    farcasterUrl: farcasterUrl || null,
                  }),
                });
                const data = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(data.error ?? "update_failed");
                setOk("Profile details saved");
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "update_failed");
              } finally {
                setBusy(false);
              }
            })();
          }}
          style={{ display: "grid", gap: "0.6rem" }}
        >
          <label>
            Short bio
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={3}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </label>
          <label>
            Website
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://"
              style={fieldStyle}
            />
          </label>
          <label>
            Twitter / X
            <input
              value={twitterUrl}
              onChange={(e) => setTwitterUrl(e.target.value)}
              placeholder="https://x.com/…"
              style={fieldStyle}
            />
          </label>
          <label>
            Farcaster
            <input
              value={farcasterUrl}
              onChange={(e) => setFarcasterUrl(e.target.value)}
              placeholder="https://warpcast.com/…"
              style={fieldStyle}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="badge"
            style={{ cursor: "pointer", background: "transparent", justifySelf: "start" }}
          >
            Save profile details
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
