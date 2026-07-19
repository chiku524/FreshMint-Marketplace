/** Mint sprig brand mark — stem joins both leaves at a shared node. */
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
      {/* Central stem → junction at leaf bases */}
      <path
        d="M32 58V34"
        stroke="var(--mint-stem)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Junction notch tying both petioles to the stem */}
      <circle cx="32" cy="34" r="1.6" fill="var(--mint-stem)" />
      {/* Left leaf + petiole from junction */}
      <path
        d="M32 34c-2.5-1-6-2-9-2.2"
        stroke="var(--mint-stem)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M23 31.8C14 30 7 24 5 15c9 1.5 16 7 19.5 15.2-0.5.5-1 .9-1.5 1.6Z"
        fill={`url(#${gid}-a)`}
      />
      {/* Right leaf + petiole from junction */}
      <path
        d="M32 34c2.5-1 6-2 9-2.2"
        stroke="var(--mint-stem)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M41 31.8C50 30 57 24 59 15c-9 1.5-16 7-19.5 15.2 0.5.5 1 .9 1.5 1.6Z"
        fill={`url(#${gid}-b)`}
      />
      {/* Midribs from junction into each blade */}
      <path
        d="M31 33.5C24 30 16 24 10 18"
        stroke="var(--mint-vein)"
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M33 33.5C40 30 48 24 54 18"
        stroke="var(--mint-vein)"
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity="0.55"
      />
      <defs>
        <linearGradient
          id={`${gid}-a`}
          x1="8"
          y1="14"
          x2="28"
          y2="34"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--mint-leaf-hi)" />
          <stop offset="1" stopColor="var(--mint-leaf-lo)" />
        </linearGradient>
        <linearGradient
          id={`${gid}-b`}
          x1="56"
          y1="14"
          x2="36"
          y2="34"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--mint-leaf-hi)" />
          <stop offset="1" stopColor="var(--mint-leaf)" />
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
