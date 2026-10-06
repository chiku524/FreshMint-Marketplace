/**
 * FreshMint mark — paired mint leaves on a short stem.
 */
import {
  MINT_JUNCTION,
  MINT_LATERAL_LEFT,
  MINT_LATERAL_RIGHT,
  MINT_LEAF_ANGLE,
  MINT_LEAF_UP,
  MINT_STEM,
  MINT_VEIN_UP,
  mintLeafTransform,
} from "@/lib/brand/mint-mark";

export function MintLeaf({
  size = 28,
  className,
  title = "FreshMint",
  gradientId,
}: {
  size?: number;
  className?: string;
  title?: string;
  gradientId?: string;
}) {
  const gid = gradientId ?? `mint-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <path
        d={MINT_STEM}
        stroke="var(--mint-stem)"
        strokeWidth="2.35"
        strokeLinecap="round"
      />
      <g transform={mintLeafTransform(-MINT_LEAF_ANGLE)}>
        <path d={MINT_LEAF_UP} fill={`url(#${gid}-fill2)`} />
        <path
          d={MINT_VEIN_UP}
          stroke="var(--mint-vein)"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.4"
        />
        <path
          d={MINT_LATERAL_LEFT}
          stroke="var(--mint-vein)"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.28"
        />
        <path
          d={MINT_LATERAL_RIGHT}
          stroke="var(--mint-vein)"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.28"
        />
      </g>
      <g transform={mintLeafTransform(MINT_LEAF_ANGLE)}>
        <path d={MINT_LEAF_UP} fill={`url(#${gid}-fill)`} />
        <path
          d={MINT_VEIN_UP}
          stroke="var(--mint-vein)"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.42"
        />
        <path
          d={MINT_LATERAL_LEFT}
          stroke="var(--mint-vein)"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.3"
        />
        <path
          d={MINT_LATERAL_RIGHT}
          stroke="var(--mint-vein)"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.3"
        />
      </g>
      <circle
        cx={MINT_JUNCTION.cx}
        cy={MINT_JUNCTION.cy}
        r={MINT_JUNCTION.r}
        fill="var(--mint-stem)"
      />
      <defs>
        <linearGradient
          id={`${gid}-fill`}
          x1="26"
          y1="14"
          x2="40"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--mint-leaf-hi)" />
          <stop offset="1" stopColor="var(--mint-leaf)" />
        </linearGradient>
        <linearGradient
          id={`${gid}-fill2`}
          x1="24"
          y1="14"
          x2="38"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--mint-leaf)" />
          <stop offset="1" stopColor="var(--mint-leaf-lo)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function BrandMark({
  size = 30,
  showWordmark = true,
}: {
  size?: number;
  showWordmark?: boolean;
}) {
  const field = Math.round(size * 1.22);
  return (
    <span
      className="fm-brand-mark"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.55rem",
      }}
    >
      <span className="fm-brand-field" style={{ width: field, height: field }}>
        <span className="fm-brand-field__wash" aria-hidden />
        <span className="fm-brand-field__rim" aria-hidden />
        <MintLeaf size={size} gradientId={`brand-${size}`} />
      </span>
      {showWordmark ? (
        <span className="display" style={{ fontWeight: 700, lineHeight: 1 }}>
          FreshMint
        </span>
      ) : null}
    </span>
  );
}
