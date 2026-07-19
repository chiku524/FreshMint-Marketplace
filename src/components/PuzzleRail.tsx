"use client";

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

function colsForWidth(width: number): number {
  if (width < 520) return 2;
  if (width < 820) return 4;
  return 6;
}

/** First-fit dense pack — mirrors CSS grid-auto-flow: dense with 2×2 / 1×1 tiles. */
function simulateRows(
  items: { featured: boolean }[],
  cols: number,
): number {
  const occ: boolean[][] = [];

  const ensure = (r: number) => {
    while (occ.length <= r) occ.push(Array.from({ length: cols }, () => false));
  };

  for (const item of items) {
    const w = Math.min(item.featured ? 2 : 1, cols);
    const h = item.featured ? (cols >= 2 ? 2 : 1) : 1;
    let placed = false;

    for (let r = 0; !placed; r++) {
      ensure(r + h - 1);
      for (let c = 0; c <= cols - w; c++) {
        let ok = true;
        for (let dr = 0; dr < h && ok; dr++) {
          for (let dc = 0; dc < w && ok; dc++) {
            if (occ[r + dr][c + dc]) ok = false;
          }
        }
        if (!ok) continue;
        for (let dr = 0; dr < h; dr++) {
          for (let dc = 0; dc < w; dc++) {
            occ[r + dr][c + dc] = true;
          }
        }
        placed = true;
        break;
      }
    }
  }

  return Math.max(occ.length, 1);
}

export function PuzzleRail({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const cols = colsForWidth(width);
      const tiles = Array.from(
        el.querySelectorAll<HTMLElement>("[data-tile]"),
      );
      const items = tiles.map((t) => ({
        featured: t.dataset.tile === "featured",
      }));
      const rows = simulateRows(
        items.length > 0 ? items : [{ featured: false }],
        cols,
      );
      el.style.setProperty("--rail-cols", String(cols));
      el.style.setProperty("--rail-rows", String(rows));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      ref={ref}
      className={["lane-rail", className].filter(Boolean).join(" ")}
      style={
        {
          "--rail-cols": 4,
          "--rail-rows": 2,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
