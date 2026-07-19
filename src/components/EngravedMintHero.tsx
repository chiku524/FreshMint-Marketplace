/**
 * Hero engraving: mint sprig etched into a medallion —
 * hatch shading, copperplate rim, no flat filled logo.
 */
export function EngravedMintHero({ size = 420 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 320 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{
        maxWidth: "100%",
        height: "auto",
        filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.45))",
      }}
    >
      <defs>
        {/* Fine diagonal hatch for plate field */}
        <pattern
          id="eng-hatch"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(38)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke="rgba(180, 196, 178, 0.11)"
            strokeWidth="0.7"
          />
        </pattern>
        {/* Cross-hatch for deeper shade */}
        <pattern
          id="eng-cross"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-42)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="5"
            stroke="rgba(110, 207, 154, 0.14)"
            strokeWidth="0.55"
          />
        </pattern>
        {/* Leaf-local hatch following a soft angle */}
        <pattern
          id="eng-leaf"
          width="3.5"
          height="3.5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(28)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="3.5"
            stroke="rgba(212, 174, 102, 0.35)"
            strokeWidth="0.45"
          />
        </pattern>
        <radialGradient id="eng-plate" cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#141c18" />
          <stop offset="55%" stopColor="#0a100e" />
          <stop offset="100%" stopColor="#050807" />
        </radialGradient>
        <linearGradient id="eng-rim" x1="40" y1="40" x2="280" y2="280">
          <stop offset="0%" stopColor="#d4ae66" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#6ecf9a" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#d4ae66" stopOpacity="0.28" />
        </linearGradient>
        <clipPath id="eng-disk">
          <circle cx="160" cy="160" r="132" />
        </clipPath>
      </defs>

      {/* Outer plate */}
      <circle cx="160" cy="160" r="148" fill="url(#eng-plate)" />
      <circle
        cx="160"
        cy="160"
        r="148"
        stroke="url(#eng-rim)"
        strokeWidth="1.25"
        opacity="0.9"
      />
      {/* Engraved concentric rims */}
      <circle
        cx="160"
        cy="160"
        r="140"
        stroke="rgba(212,174,102,0.22)"
        strokeWidth="0.6"
      />
      <circle
        cx="160"
        cy="160"
        r="132"
        stroke="rgba(110,207,154,0.2)"
        strokeWidth="0.75"
      />
      {/* Beaded rim ticks */}
      {Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2;
        const r0 = 143;
        const r1 = i % 3 === 0 ? 149.5 : 147;
        return (
          <line
            key={i}
            x1={160 + Math.cos(a) * r0}
            y1={160 + Math.sin(a) * r0}
            x2={160 + Math.cos(a) * r1}
            y2={160 + Math.sin(a) * r1}
            stroke={i % 3 === 0 ? "rgba(212,174,102,0.35)" : "rgba(138,150,140,0.18)"}
            strokeWidth={i % 3 === 0 ? 1 : 0.55}
            strokeLinecap="round"
          />
        );
      })}

      <g clipPath="url(#eng-disk)">
        {/* Plate field hatch */}
        <circle cx="160" cy="160" r="132" fill="url(#eng-hatch)" />
        <circle
          cx="160"
          cy="188"
          r="90"
          fill="url(#eng-cross)"
          opacity="0.7"
        />

        {/* Soft vignette rings (etched feel) */}
        <circle
          cx="160"
          cy="160"
          r="118"
          stroke="rgba(232,235,230,0.04)"
          strokeWidth="18"
        />

        {/* ——— Engraved mint sprig ——— */}
        <g transform="translate(160 178)">
          {/* Stem with weight variation via parallel strokes */}
          <path
            d="M0 52V-8"
            stroke="rgba(212,174,102,0.55)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M-1.1 52V-6"
            stroke="rgba(110,207,154,0.25)"
            strokeWidth="0.7"
            strokeLinecap="round"
          />
          <circle cx="0" cy="-8" r="2.2" fill="none" stroke="rgba(212,174,102,0.5)" strokeWidth="1" />

          {/* Left leaf outline + hatch fill */}
          <path
            d="M0-8c-8-3-22-6-34-4-6 14 2 32 18 40 6 3 12 4 16 3-2-12-4-26 0-39Z"
            fill="url(#eng-leaf)"
            stroke="rgba(212,174,102,0.65)"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          {/* Left serrations (engraved nicks) */}
          {[
            [-18, -6],
            [-26, 2],
            [-28, 12],
            [-24, 22],
            [-16, 28],
          ].map(([x, y], i) => (
            <line
              key={`ls-${i}`}
              x1={x}
              y1={y}
              x2={x - 4}
              y2={y + 2}
              stroke="rgba(232,235,230,0.2)"
              strokeWidth="0.7"
              strokeLinecap="round"
            />
          ))}
          {/* Left midrib + veins */}
          <path
            d="M-1-7C-14-4-24 6-28 22"
            stroke="rgba(110,207,154,0.55)"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path d="M-10 2l-8 4" stroke="rgba(110,207,154,0.35)" strokeWidth="0.65" />
          <path d="M-14 12l-9 3" stroke="rgba(110,207,154,0.32)" strokeWidth="0.65" />
          <path d="M-16 20l-7 2" stroke="rgba(110,207,154,0.28)" strokeWidth="0.65" />

          {/* Right leaf */}
          <path
            d="M0-8c8-3 22-6 34-4 6 14-2 32-18 40-6 3-12 4-16 3 2-12 4-26 0-39Z"
            fill="url(#eng-leaf)"
            stroke="rgba(212,174,102,0.65)"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          {[
            [18, -6],
            [26, 2],
            [28, 12],
            [24, 22],
            [16, 28],
          ].map(([x, y], i) => (
            <line
              key={`rs-${i}`}
              x1={x}
              y1={y}
              x2={x + 4}
              y2={y + 2}
              stroke="rgba(232,235,230,0.2)"
              strokeWidth="0.7"
              strokeLinecap="round"
            />
          ))}
          <path
            d="M1-7C14-4 24 6 28 22"
            stroke="rgba(110,207,154,0.55)"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path d="M10 2l8 4" stroke="rgba(110,207,154,0.35)" strokeWidth="0.65" />
          <path d="M14 12l9 3" stroke="rgba(110,207,154,0.32)" strokeWidth="0.65" />
          <path d="M16 20l7 2" stroke="rgba(110,207,154,0.28)" strokeWidth="0.65" />
        </g>

        {/* Small engraved legend arc */}
        <path
          id="eng-arc"
          d="M78 248c28 28 136 28 164 0"
          fill="none"
        />
        <text
          fill="rgba(212,174,102,0.42)"
          fontSize="9"
          fontFamily="var(--font-syne), system-ui, sans-serif"
          letterSpacing="0.28em"
        >
          <textPath href="#eng-arc" startOffset="18%">
            FRESHMINT · EST. DISCOVERY
          </textPath>
        </text>
      </g>

      {/* Specular nick — like light on metal engraving */}
      <path
        d="M72 78c28-22 58-28 78-24"
        stroke="rgba(232,235,230,0.12)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
