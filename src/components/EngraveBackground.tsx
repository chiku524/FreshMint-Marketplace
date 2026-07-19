/**
 * Site-wide engraved stone field — fine hatch lines + vein etchings
 * (inspired by the boing.finance background treatment).
 */
export function EngraveBackground() {
  const gid = "fm-engrave";
  return (
    <div className="fm-engrave-bg" aria-hidden>
      <div className="fm-engrave-stone" />
      <div className="fm-engrave-hatch" />
      <div className="fm-engrave-grain" />
      <svg
        className="fm-engrave-vein"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 280"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`${gid}-line`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8a9a8f" stopOpacity="0.12" />
            <stop offset="30%" stopColor="#c5d4c8" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#6ecf9a" stopOpacity="0.16" />
            <stop offset="80%" stopColor="#6a7680" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#9aa89c" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id={`${gid}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d4ae66" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#6ecf9a" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#d4ae66" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* Primary vertical veins (shadow then highlight — etched depth) */}
        <path
          className="fm-engrave-vein__shadow"
          fill="none"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth="0.85"
          strokeLinecap="round"
          d="M18 0C22 40 12 70 20 110C28 150 10 190 18 230C24 255 14 268 12 280"
        />
        <path
          fill="none"
          stroke={`url(#${gid}-line)`}
          strokeWidth="0.45"
          strokeLinecap="round"
          d="M18 0C22 40 12 70 20 110C28 150 10 190 18 230C24 255 14 268 12 280"
        />

        <path
          className="fm-engrave-vein__shadow"
          fill="none"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="0.7"
          strokeLinecap="round"
          d="M72 0C68 35 78 75 70 115C62 155 80 195 68 235C60 258 74 270 78 280"
        />
        <path
          fill="none"
          stroke={`url(#${gid}-line)`}
          strokeWidth="0.4"
          strokeLinecap="round"
          d="M72 0C68 35 78 75 70 115C62 155 80 195 68 235C60 258 74 270 78 280"
        />

        {/* Branching etch lines */}
        <path
          className="fm-engrave-vein__shadow fm-engrave-vein__branch"
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth="0.55"
          d="M20 110C38 118 52 108 68 115"
        />
        <path
          className="fm-engrave-vein__branch"
          fill="none"
          stroke={`url(#${gid}-gold)`}
          strokeWidth="0.35"
          d="M20 110C38 118 52 108 68 115"
        />

        <path
          className="fm-engrave-vein__shadow fm-engrave-vein__branch"
          fill="none"
          stroke="rgba(0,0,0,0.32)"
          strokeWidth="0.5"
          d="M70 195C48 208 32 198 18 210"
        />
        <path
          className="fm-engrave-vein__branch"
          fill="none"
          stroke={`url(#${gid}-gold)`}
          strokeWidth="0.32"
          d="M70 195C48 208 32 198 18 210"
        />

        <path
          fill="none"
          stroke={`url(#${gid}-line)`}
          strokeWidth="0.28"
          strokeLinecap="round"
          opacity="0.8"
          d="M40 20C44 55 36 90 42 130C48 170 34 210 40 250"
        />
        <path
          fill="none"
          stroke={`url(#${gid}-gold)`}
          strokeWidth="0.25"
          strokeLinecap="round"
          opacity="0.7"
          d="M88 40C84 90 92 140 86 190C82 230 90 255 92 280"
        />

        {/* Engraved nodes */}
        <g fill="none" strokeLinecap="round">
          <circle cx="20" cy="110" r="1.1" stroke="rgba(197,212,200,0.2)" />
          <circle cx="68" cy="115" r="0.9" stroke="rgba(212,174,102,0.18)" />
          <circle cx="18" cy="210" r="1" stroke="rgba(110,207,154,0.16)" />
          <circle cx="70" cy="195" r="0.85" stroke="rgba(197,212,200,0.14)" />
        </g>
      </svg>
    </div>
  );
}
