type EtchProps = {
  d: string;
  stroke: string;
  width?: number;
  opacity?: number;
  dash?: string;
};

function Etch({ d, stroke, width = 1.1, opacity = 1, dash }: EtchProps) {
  return (
    <g opacity={opacity}>
      <path
        className="fm-engrave-vein__shadow"
        fill="none"
        stroke="rgba(0,0,0,0.42)"
        strokeWidth={width * 1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
        d={d}
      />
      <path
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
        d={d}
      />
    </g>
  );
}

/**
 * Site-wide engraved stone field — hatch + grain + abstract etched artwork
 * (composition inspired by engraved plates / contour maps, not vertical squiggles).
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
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`${gid}-line`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8a9a8f" stopOpacity="0.14" />
            <stop offset="40%" stopColor="#c5d4c8" stopOpacity="0.28" />
            <stop offset="70%" stopColor="#6ecf9a" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#9aa89c" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id={`${gid}-gold`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d4ae66" stopOpacity="0.1" />
            <stop offset="45%" stopColor="#6ecf9a" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#d4ae66" stopOpacity="0.08" />
          </linearGradient>
          <radialGradient id={`${gid}-soft`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c5d4c8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6ecf9a" stopOpacity="0.05" />
          </radialGradient>
        </defs>

        {/* —— Upper-right: engraved orbital plate —— */}
        <g transform="translate(860 140)">
          <Etch
            d="M0 -118A118 118 0 1 1 0 118A118 118 0 1 1 0 -118"
            stroke={`url(#${gid}-line)`}
            width={1.15}
            opacity={0.85}
          />
          <Etch
            d="M0 -78A78 78 0 1 1 0 78A78 78 0 1 1 0 -78"
            stroke={`url(#${gid}-gold)`}
            width={0.9}
            opacity={0.75}
          />
          <Etch
            d="M0 -42A42 42 0 1 1 0 42A42 42 0 1 1 0 -42"
            stroke={`url(#${gid}-line)`}
            width={0.7}
            opacity={0.65}
            dash="3 7"
          />
          {/* Broken arc segments — plate incompleteness */}
          <Etch
            d="M-150 -40C-130 -90 -70 -130 -10 -138"
            stroke={`url(#${gid}-gold)`}
            width={1}
            opacity={0.7}
          />
          <Etch
            d="M40 132C100 120 150 70 158 10"
            stroke={`url(#${gid}-line)`}
            width={0.95}
            opacity={0.65}
          />
          {/* Radial ticks */}
          {[0, 28, 56, 84, 112, 140, 168, 196, 224, 252, 280, 308, 336].map(
            (deg) => {
              const a = (deg * Math.PI) / 180;
              const x1 = Math.cos(a) * 88;
              const y1 = Math.sin(a) * 88;
              const x2 = Math.cos(a) * 112;
              const y2 = Math.sin(a) * 112;
              return (
                <Etch
                  key={deg}
                  d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`}
                  stroke={`url(#${gid}-line)`}
                  width={0.55}
                  opacity={0.45}
                />
              );
            },
          )}
        </g>

        {/* —— Mid-left: contour bloom (topo / organic volume) —— */}
        <g>
          <Etch
            d="M80 320C140 220 260 180 380 210C500 240 560 320 520 420C480 520 340 560 220 520C100 480 40 400 80 320Z"
            stroke={`url(#${gid}-line)`}
            width={1.2}
            opacity={0.7}
          />
          <Etch
            d="M130 330C175 260 265 235 355 258C445 281 490 340 460 410C430 480 330 510 240 480C150 450 95 390 130 330Z"
            stroke={`url(#${gid}-gold)`}
            width={0.95}
            opacity={0.65}
          />
          <Etch
            d="M180 340C210 290 275 275 340 292C405 309 435 350 415 400C395 450 330 470 270 450C210 430 155 385 180 340Z"
            stroke={`url(#${gid}-line)`}
            width={0.8}
            opacity={0.55}
          />
          <Etch
            d="M230 355C250 325 290 318 330 330C370 342 385 370 372 400C359 430 320 440 285 428C250 416 212 380 230 355Z"
            stroke={`url(#${gid}-soft)`}
            width={0.7}
            opacity={0.5}
          />
          {/* Interior contour “fault” lines */}
          <Etch
            d="M200 380C260 360 320 365 390 390"
            stroke={`url(#${gid}-gold)`}
            width={0.65}
            opacity={0.55}
          />
          <Etch
            d="M170 420C250 400 340 405 430 440"
            stroke={`url(#${gid}-line)`}
            width={0.55}
            opacity={0.45}
            dash="4 6"
          />
        </g>

        {/* —— Lower-right: angular facet lattice —— */}
        <g>
          <Etch
            d="M720 520L860 460L1020 500L980 640L820 680L720 520Z"
            stroke={`url(#${gid}-line)`}
            width={1.05}
            opacity={0.6}
          />
          <Etch
            d="M860 460L900 560L820 680"
            stroke={`url(#${gid}-gold)`}
            width={0.75}
            opacity={0.55}
          />
          <Etch
            d="M860 460L980 640"
            stroke={`url(#${gid}-line)`}
            width={0.65}
            opacity={0.45}
          />
          <Etch
            d="M1020 500L900 560L720 520"
            stroke={`url(#${gid}-gold)`}
            width={0.6}
            opacity={0.4}
            dash="5 5"
          />
          <Etch
            d="M780 600L900 560L940 620"
            stroke={`url(#${gid}-line)`}
            width={0.55}
            opacity={0.4}
          />
        </g>

        {/* —— Spanning arcs: ties the composition together —— */}
        <Etch
          d="M380 210C520 80 700 60 860 140"
          stroke={`url(#${gid}-gold)`}
          width={0.9}
          opacity={0.55}
        />
        <Etch
          d="M520 420C620 480 680 500 720 520"
          stroke={`url(#${gid}-line)`}
          width={0.85}
          opacity={0.5}
        />
        <Etch
          d="M220 520C300 620 480 700 720 680"
          stroke={`url(#${gid}-gold)`}
          width={0.7}
          opacity={0.4}
          dash="6 8"
        />
        <Etch
          d="M80 320C40 200 120 80 280 40C420 5 600 20 740 70"
          stroke={`url(#${gid}-line)`}
          width={0.75}
          opacity={0.4}
        />

        {/* —— Constellation nodes at junctions —— */}
        <g fill="none" strokeLinecap="round">
          {[
            [380, 210, 3.2, "rgba(197,212,200,0.28)"],
            [520, 420, 2.6, "rgba(212,174,102,0.22)"],
            [860, 140, 3.5, "rgba(110,207,154,0.24)"],
            [720, 520, 2.8, "rgba(197,212,200,0.2)"],
            [980, 640, 2.2, "rgba(212,174,102,0.18)"],
            [220, 520, 2.4, "rgba(110,207,154,0.18)"],
            [330, 330, 2, "rgba(197,212,200,0.16)"],
          ].map(([x, y, r, stroke], i) => (
            <g key={i}>
              <circle
                cx={x as number}
                cy={y as number}
                r={(r as number) + 1.4}
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={1.2}
              />
              <circle
                cx={x as number}
                cy={y as number}
                r={r as number}
                stroke={stroke as string}
                strokeWidth={1}
              />
            </g>
          ))}
        </g>

        {/* —— Fine accent scratches (secondary layer) —— */}
        <g opacity={0.35}>
          <Etch
            d="M1040 220C1100 300 1120 400 1080 520"
            stroke={`url(#${gid}-line)`}
            width={0.5}
          />
          <Etch
            d="M60 560C140 640 260 720 420 740"
            stroke={`url(#${gid}-gold)`}
            width={0.5}
          />
          <Etch
            d="M640 40C700 120 720 200 680 280"
            stroke={`url(#${gid}-line)`}
            width={0.45}
            dash="2 5"
          />
        </g>
      </svg>
    </div>
  );
}
