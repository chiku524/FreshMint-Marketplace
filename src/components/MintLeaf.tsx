/** Mint leaf brand mark used in header, hero, and favicon. */
export function MintLeaf({
  size = 28,
  className,
  title = "FreshMint",
  gradientId,
}: {
  size?: number;
  className?: string;
  title?: string;
  /** Unique suffix so multiple leaves on one page don't clash gradients. */
  gradientId?: string;
}) {
  const gid = gradientId ?? `ml-${size}`;
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
        d="M32 54c0-10 1.5-18 4-26"
        stroke="var(--mint-stem)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M36 28c8-2 16-8 18-18-12 1-22 7-26 16 2 1 5 2 8 2Z"
        fill={`url(#${gid}-a)`}
      />
      <path
        d="M28 30c-8-1-16-6-20-14 11 0 20 5 24 13-1.5.5-2.8.8-4 1Z"
        fill={`url(#${gid}-b)`}
        opacity="0.92"
      />
      <path
        d="M34 30c2-6 6-12 12-16"
        stroke="var(--mint-vein)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M30 31c-3-5-8-9-14-12"
        stroke="var(--mint-vein)"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.65"
      />
      <defs>
        <linearGradient
          id={`${gid}-a`}
          x1="34"
          y1="10"
          x2="50"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--mint-leaf-hi)" />
          <stop offset="1" stopColor="var(--mint-leaf)" />
        </linearGradient>
        <linearGradient
          id={`${gid}-b`}
          x1="18"
          y1="14"
          x2="32"
          y2="32"
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
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.55rem",
      }}
    >
      <MintLeaf size={size} gradientId={`brand-${size}`} />
      {showWordmark ? (
        <span className="display" style={{ fontWeight: 700, lineHeight: 1 }}>
          FreshMint
        </span>
      ) : null}
    </span>
  );
}
