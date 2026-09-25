import { FmImage } from "@/components/FmImage";
import type { CSSProperties } from "react";

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

export function creatorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function CreatorAvatar({
  id,
  displayName,
  avatarUrl,
  size = 44,
  className,
}: {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const hue = hueFromId(id);
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 999,
    flex: "0 0 auto",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    fontSize: Math.max(10, Math.round(size * 0.28)),
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: "#fff",
    background: `linear-gradient(145deg, hsla(${hue}, 55%, 48%, 0.9), hsla(${(hue + 40) % 360}, 40%, 28%, 0.95))`,
  };

  if (avatarUrl) {
    return (
      <span className={className} style={{ ...style, padding: 0 }}>
        <FmImage
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          sizes={`${size}px`}
        />
      </span>
    );
  }

  return (
    <div className={className} style={style} aria-hidden>
      {creatorInitials(displayName)}
    </div>
  );
}
