/**
 * FreshMint mark — paired mint leaves on a short stem.
 */
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
        d="M32 58c.2-9 .6-17 1.2-28"
        stroke="var(--mint-stem)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* Right leaf — soft scalloped outer edge */}
      <path
        d="M33.2 30
           C38 24 44 18 50 13
           C51.5 14.8 51.2 16.5 50 17.2
           C52 18.5 52.2 20.2 50.8 21.2
           C53 22.8 53 24.8 51.2 26
           C48 28.5 41 32 33.2 30Z"
        fill={`url(#${gid}-fill)`}
      />
      {/* Left leaf */}
      <path
        d="M33.2 30
           C28.5 24 22.5 18 16.5 13.5
           C15 15.3 15.3 17 16.5 17.7
           C14.5 19 14.3 20.7 15.7 21.7
           C13.5 23.3 13.5 25.3 15.3 26.5
           C18.5 29 26 32 33.2 30Z"
        fill={`url(#${gid}-fill2)`}
      />
      <circle cx="33.2" cy="30.4" r="2.1" fill="var(--mint-stem)" />
      <path
        d="M33.2 30C40 23.5 46.5 17.5 51.5 13.5"
        stroke="var(--mint-vein)"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.48"
      />
      <path
        d="M33.2 30C26.5 23.5 20 18 15 14"
        stroke="var(--mint-vein)"
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity="0.42"
      />
      <path
        d="M38 26l4.2-1.8M41.5 22.5l3.6-2M36.5 28l2.8.4"
        stroke="var(--mint-vein)"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M28 26l-4.2-1.8M24.5 22.5l-3.6-2M29.5 28l-2.8.4"
        stroke="var(--mint-vein)"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.28"
      />
      <defs>
        <linearGradient
          id={`${gid}-fill`}
          x1="38"
          y1="14"
          x2="46"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--mint-leaf-hi)" />
          <stop offset="1" stopColor="var(--mint-leaf)" />
        </linearGradient>
        <linearGradient
          id={`${gid}-fill2`}
          x1="16"
          y1="14"
          x2="30"
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
      <span
        className="fm-brand-field"
        style={{ width: field, height: field }}
      >
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
