"use client";
import { friendlyError } from "@/lib/client/friendly-error";
import { toast } from "@/lib/client/toast";
import { CreatorAvatar } from "@/components/CreatorAvatar";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";

type Section = "photo" | "profile" | "login";

const SETTINGS_ERRORS: Record<string, string> = {
  update_failed: "Couldn't save. Check your connection and try again.",
  attach_failed: "Couldn't add email sign-in. Please try again.",
  email_taken: "That email is already used by another profile.",
  sign_in: "Your session expired. Sign in again.",
  upload_failed: "Upload failed. Try a smaller image.",
  avatar_update_failed: "Couldn't update your photo. Please try again.",
};

function friendlySettingsError(code: string): string {
  return SETTINGS_ERRORS[code] ?? friendlyError(code);
}

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
  const [notice, setNotice] = useState<{
    section: Section;
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  useEffect(() => {
    if (notice) toast(notice.text, notice.kind);
  }, [notice]);
  const [section, setSectionState] = useState<Section>("profile");
  const sectionRef = useRef<Section>("profile");
  const setSection = (next: Section) => {
    sectionRef.current = next;
    setSectionState(next);
  };
  const setError = (text: string | null) =>
    setNotice(text ? { section: sectionRef.current, kind: "error", text: friendlySettingsError(text) } : null);
  const setOk = (text: string | null) =>
    setNotice(text ? { section: sectionRef.current, kind: "ok", text } : null);
  const dirty =
    name.trim() !== displayName.trim() ||
    bio !== initialBio ||
    websiteUrl !== (initialWebsite ?? "") ||
    twitterUrl !== (initialTwitter ?? "") ||
    farcasterUrl !== (initialFarcaster ?? "");
  const feedback = (f: Section) =>
    notice && notice.section === f ? (
      <p
        role={notice.kind === "error" ? "alert" : "status"}
        className={notice.kind === "error" ? "fm-form-error" : "fm-form-ok"}
      >
        {notice.text}
      </p>
    ) : null;

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
    setSection("photo");
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
      setError(friendlyError(err instanceof Error ? err.message : "upload_failed"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearPhoto() {
    setSection("photo");
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await patchAvatar(null);
      setOk("Profile photo cleared");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "avatar_update_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function attachCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSection("login");
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
      setError(friendlyError(err instanceof Error ? err.message : "attach_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="me-section">
      <h2 className="display me-section__title">Profile</h2>
      <div className="fm-form-surface fm-form-stack">
        <p className="fm-form-note">
          {email ? `Signed in as ${email}` : "No email yet \u2014 add one below to sign in without a wallet."}
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
            <p className="fm-form-note">
              Square photo works best (PNG, JPEG, WebP or GIF). Saves as soon
              as it uploads.
            </p>
            <div className="fm-form-actions">
              <button
                type="button"
                disabled={busy}
                className="fm-btn fm-btn--ghost"
                onClick={() => fileRef.current?.click()}
              >
                Upload photo
              </button>
              {photoUrl ? (
                <button
                  type="button"
                  disabled={busy}
                  className="fm-btn fm-btn--ghost"
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
            {feedback("photo")}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSection("profile");
            void (async () => {
              setBusy(true);
              setError(null);
              setOk(null);
              try {
                const res = await fetch("/api/auth/profile", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    displayName: name.trim(),
                    bio,
                    websiteUrl: websiteUrl || null,
                    twitterUrl: twitterUrl || null,
                    farcasterUrl: farcasterUrl || null,
                  }),
                });
                const data = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(data.error ?? "update_failed");
                setOk("Profile saved");
                router.refresh();
              } catch (err) {
                setError(friendlyError(err instanceof Error ? err.message : "update_failed"));
              } finally {
                setBusy(false);
              }
            })();
          }}
          className="fm-form-stack"
        >
          <label>
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              required
              className="fm-field"
            />
          </label>
          <label>
            Short bio
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={3}
              className="fm-field"
            />
          </label>
          <label>
            Website
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://"
              className="fm-field"
            />
          </label>
          <label>
            Twitter / X
            <input
              value={twitterUrl}
              onChange={(e) => setTwitterUrl(e.target.value)}
              placeholder="https://x.com/…"
              className="fm-field"
            />
          </label>
          <label>
            Farcaster
            <input
              value={farcasterUrl}
              onChange={(e) => setFarcasterUrl(e.target.value)}
              placeholder="https://warpcast.com/…"
              className="fm-field"
            />
          </label>
          <div className="fm-form-actions">
            <button
              type="submit"
              disabled={busy || !dirty}
              className="fm-btn fm-btn--primary"
            >
              {busy && section === "profile" ? "Saving\u2026" : "Save profile"}
            </button>
            {dirty ? <span className="fm-form-note">Unsaved changes</span> : null}
          </div>
          {feedback("profile")}
        </form>

        {!hasPassword ? (
          <form
            onSubmit={(e) => void attachCredentials(e)}
            className="fm-form-stack"
          >
            <h3 className="me-subsection__title">Email sign-in</h3>
            <p className="fm-form-note">
              Add an email and password so you can sign in without a wallet.
            </p>
            <label>
              Email
              <input
                name="email"
                type="email"
                defaultValue={email ?? ""}
                required
                className="fm-field"
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
                className="fm-field"
              />
            </label>
            <div className="fm-form-actions">
              <button type="submit" disabled={busy} className="fm-btn fm-btn--primary">
                {busy && section === "login" ? "Saving\u2026" : "Add email sign-in"}
              </button>
            </div>
            {feedback("login")}
          </form>
        ) : null}

        {!googleLinked && googleEnabled ? (
          <a
            href="/api/auth/google?intent=link&next=/me/settings"
            className="fm-btn fm-btn--ghost"
          >
            Link Google
          </a>
        ) : null}

      </div>
    </section>
  );
}
