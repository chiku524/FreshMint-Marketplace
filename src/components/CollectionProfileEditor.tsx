"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

async function uploadImage(file: File): Promise<string> {
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
  return data.mediaUrl;
}

export function CollectionProfileEditor({
  collectionId,
  description: initialDescription = "",
  imageUrl: initialImage = null,
  bannerUrl: initialBanner = null,
  websiteUrl: initialWebsite = null,
  twitterUrl: initialTwitter = null,
  discordUrl: initialDiscord = null,
  instagramUrl: initialInstagram = null,
}: {
  collectionId: string;
  description?: string;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  discordUrl?: string | null;
  instagramUrl?: string | null;
}) {
  const router = useRouter();
  const imageRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(initialDescription);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImage);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialBanner);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsite ?? "");
  const [twitterUrl, setTwitterUrl] = useState(initialTwitter ?? "");
  const [discordUrl, setDiscordUrl] = useState(initialDiscord ?? "");
  const [instagramUrl, setInstagramUrl] = useState(initialInstagram ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          imageUrl,
          bannerUrl,
          websiteUrl: websiteUrl || null,
          twitterUrl: twitterUrl || null,
          discordUrl: discordUrl || null,
          instagramUrl: instagramUrl || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        errors?: string[];
      };
      if (!res.ok) {
        throw new Error(
          (Array.isArray(data.errors) && data.errors.join(", ")) ||
            data.error ||
            "update_failed",
        );
      }
      setOk("Collection profile saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPick(
    kind: "image" | "banner",
    file: File | null,
  ) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const url = await uploadImage(file);
      if (kind === "image") setImageUrl(url);
      else setBannerUrl(url);
      setOk(kind === "image" ? "Logo uploaded — save to apply" : "Banner uploaded — save to apply");
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload_failed");
    } finally {
      setBusy(false);
      if (kind === "image" && imageRef.current) imageRef.current.value = "";
      if (kind === "banner" && bannerRef.current) bannerRef.current.value = "";
    }
  }

  return (
    <form className="collection-profile-editor" onSubmit={save}>
      <h2 className="display collection-profile-editor__title">
        Collection profile
      </h2>
      <p className="collection-profile-editor__lead">
        Logo, banner, and social links shown on your collection page — similar to
        OpenSea collection headers.
      </p>

      <div className="collection-profile-editor__media">
        <div>
          <span className="collection-profile-editor__label">Logo</span>
          <div
            className="collection-profile-editor__preview collection-profile-editor__preview--logo"
            style={
              imageUrl
                ? { backgroundImage: `url(${imageUrl})` }
                : undefined
            }
          />
          <div className="collection-profile-editor__media-actions">
            <button
              type="button"
              className="badge"
              disabled={busy}
              onClick={() => imageRef.current?.click()}
            >
              Upload logo
            </button>
            {imageUrl ? (
              <button
                type="button"
                className="badge"
                disabled={busy}
                onClick={() => setImageUrl(null)}
              >
                Clear
              </button>
            ) : null}
          </div>
          <input
            ref={imageRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => void onPick("image", e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <span className="collection-profile-editor__label">Banner</span>
          <div
            className="collection-profile-editor__preview collection-profile-editor__preview--banner"
            style={
              bannerUrl
                ? { backgroundImage: `url(${bannerUrl})` }
                : undefined
            }
          />
          <div className="collection-profile-editor__media-actions">
            <button
              type="button"
              className="badge"
              disabled={busy}
              onClick={() => bannerRef.current?.click()}
            >
              Upload banner
            </button>
            {bannerUrl ? (
              <button
                type="button"
                className="badge"
                disabled={busy}
                onClick={() => setBannerUrl(null)}
              >
                Clear
              </button>
            ) : null}
          </div>
          <input
            ref={bannerRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => void onPick("banner", e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="What is this collection about?"
          className="fm-field"
        />
      </label>

      <div className="collection-profile-editor__grid">
        <label>
          Website
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://"
            className="fm-field"
            inputMode="url"
          />
        </label>
        <label>
          X / Twitter
          <input
            value={twitterUrl}
            onChange={(e) => setTwitterUrl(e.target.value)}
            placeholder="https://x.com/…"
            className="fm-field"
            inputMode="url"
          />
        </label>
        <label>
          Discord
          <input
            value={discordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            placeholder="https://discord.gg/…"
            className="fm-field"
            inputMode="url"
          />
        </label>
        <label>
          Instagram
          <input
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            placeholder="https://instagram.com/…"
            className="fm-field"
            inputMode="url"
          />
        </label>
      </div>

      {error ? <p className="collection-profile-editor__error">{error}</p> : null}
      {ok ? <p className="collection-profile-editor__ok">{ok}</p> : null}

      <button type="submit" className="fm-btn fm-btn--primary" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
