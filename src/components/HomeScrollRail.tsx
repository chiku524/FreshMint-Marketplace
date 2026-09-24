import type { CSSProperties, ReactNode } from "react";

/** Horizontal scroll on narrow viewports; wraps on wider screens. */
export function HomeScrollRail({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={["fm-h-scroll", className].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}
