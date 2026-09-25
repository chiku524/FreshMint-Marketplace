import Image from "next/image";
import type { CSSProperties } from "react";

/**
 * next/image wrapper with sensible defaults for marketplace cards.
 * Falls back to a plain img for relative /uploads when needed.
 */
export function FmImage({
  src,
  alt,
  width,
  height,
  fill,
  className,
  style,
  sizes = "(max-width: 640px) 90vw, 320px",
  priority,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
  sizes?: string;
  priority?: boolean;
}) {
  if (!src) return null;
  const isRemote = src.startsWith("http://") || src.startsWith("https://");
  const isLocalUpload = src.startsWith("/uploads/");

  if (isRemote || isLocalUpload) {
    if (fill) {
      return (
        <Image
          src={src}
          alt={alt}
          fill
          className={className}
          style={{ objectFit: "cover", ...style }}
          sizes={sizes}
          priority={priority}
        />
      );
    }
    return (
      <Image
        src={src}
        alt={alt}
        width={width ?? 640}
        height={height ?? 640}
        className={className}
        style={style}
        sizes={sizes}
        priority={priority}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
    />
  );
}
