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
        viewBox="0 0 1200 2400"
        preserveAspectRatio="none"
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

        {/* —— Mid-page: second contour well —— */}
        <g>
          <Etch
            d="M640 820C760 760 920 780 1020 860C1120 940 1100 1080 980 1160C860 1240 680 1220 580 1120C480 1020 520 880 640 820Z"
            stroke={`url(#${gid}-line)`}
            width={1.1}
            opacity={0.65}
          />
          <Etch
            d="M700 880C790 840 900 860 970 920C1040 980 1025 1080 940 1135C855 1190 730 1175 665 1105C600 1035 630 920 700 880Z"
            stroke={`url(#${gid}-gold)`}
            width={0.85}
            opacity={0.55}
          />
          <Etch
            d="M760 940C820 915 890 930 935 975C980 1020 970 1085 920 1120C870 1155 795 1145 755 1095C715 1045 720 965 760 940Z"
            stroke={`url(#${gid}-soft)`}
            width={0.7}
            opacity={0.45}
          />
        </g>

        {/* —— Lower-left: crescent arcs —— */}
        <g>
          <Etch
            d="M40 1280C120 1180 260 1140 400 1180C520 1215 580 1320 540 1430"
            stroke={`url(#${gid}-line)`}
            width={1.15}
            opacity={0.6}
          />
          <Etch
            d="M80 1320C150 1240 260 1210 380 1245C480 1275 530 1360 500 1450"
            stroke={`url(#${gid}-gold)`}
            width={0.9}
            opacity={0.55}
          />
          <Etch
            d="M130 1360C190 1300 280 1280 370 1310C440 1335 480 1400 460 1470"
            stroke={`url(#${gid}-line)`}
            width={0.7}
            opacity={0.45}
            dash="4 7"
          />
        </g>

        {/* —— Lower facet shard —— */}
        <g>
          <Etch
            d="M780 1480L960 1420L1120 1520L1060 1680L880 1720L780 1480Z"
            stroke={`url(#${gid}-line)`}
            width={1}
            opacity={0.55}
          />
          <Etch
            d="M960 1420L980 1580L880 1720"
            stroke={`url(#${gid}-gold)`}
            width={0.7}
            opacity={0.5}
          />
          <Etch
            d="M1120 1520L980 1580L780 1480"
            stroke={`url(#${gid}-line)`}
            width={0.6}
            opacity={0.4}
            dash="5 5"
          />
        </g>

        {/* —— Bottom: nested rings + closing bloom —— */}
        <g transform="translate(280 2050)">
          <Etch
            d="M0 -100A100 100 0 1 1 0 100A100 100 0 1 1 0 -100"
            stroke={`url(#${gid}-line)`}
            width={1}
            opacity={0.55}
          />
          <Etch
            d="M0 -62A62 62 0 1 1 0 62A62 62 0 1 1 0 -62"
            stroke={`url(#${gid}-gold)`}
            width={0.8}
            opacity={0.5}
          />
          <Etch
            d="M0 -28A28 28 0 1 1 0 28A28 28 0 1 1 0 -28"
            stroke={`url(#${gid}-line)`}
            width={0.6}
            opacity={0.4}
            dash="3 6"
          />
        </g>
        <Etch
          d="M520 1980C640 1920 820 1940 960 2040C1060 2110 1080 2240 980 2320C860 2420 620 2400 500 2280C400 2180 420 2040 520 1980Z"
          stroke={`url(#${gid}-line)`}
          width={1.05}
          opacity={0.5}
        />
        <Etch
          d="M580 2040C670 2000 800 2020 900 2095C970 2150 985 2240 915 2300C830 2375 660 2360 575 2270C510 2200 515 2080 580 2040Z"
          stroke={`url(#${gid}-gold)`}
          width={0.8}
          opacity={0.42}
        />

        {/* —— Spanning arcs: spine that runs the full page —— */}
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
          d="M220 520C300 620 480 720 640 820"
          stroke={`url(#${gid}-gold)`}
          width={0.75}
          opacity={0.45}
          dash="6 8"
        />
        <Etch
          d="M980 640C1040 720 1060 800 1020 860"
          stroke={`url(#${gid}-line)`}
          width={0.7}
          opacity={0.45}
        />
        <Etch
          d="M580 1120C420 1180 280 1220 160 1320"
          stroke={`url(#${gid}-gold)`}
          width={0.8}
          opacity={0.45}
        />
        <Etch
          d="M540 1430C640 1480 720 1500 780 1480"
          stroke={`url(#${gid}-line)`}
          width={0.75}
          opacity={0.42}
        />
        <Etch
          d="M880 1720C700 1820 480 1900 280 2050"
          stroke={`url(#${gid}-gold)`}
          width={0.85}
          opacity={0.45}
        />
        <Etch
          d="M380 2150C480 2100 560 2050 640 2020"
          stroke={`url(#${gid}-line)`}
          width={0.7}
          opacity={0.4}
          dash="5 7"
        />
        <Etch
          d="M80 320C40 200 120 80 280 40C420 5 600 20 740 70"
          stroke={`url(#${gid}-line)`}
          width={0.75}
          opacity={0.4}
        />
        <Etch
          d="M40 1280C20 1500 60 1800 180 2050C240 2160 360 2260 520 2320"
          stroke={`url(#${gid}-line)`}
          width={0.65}
          opacity={0.35}
        />
        <Etch
          d="M1120 1520C1160 1700 1140 1950 1040 2150C960 2280 800 2360 640 2340"
          stroke={`url(#${gid}-gold)`}
          width={0.6}
          opacity={0.35}
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
            [640, 820, 2.8, "rgba(197,212,200,0.22)"],
            [980, 1160, 2.4, "rgba(212,174,102,0.18)"],
            [160, 1320, 2.6, "rgba(110,207,154,0.2)"],
            [540, 1430, 2.3, "rgba(197,212,200,0.18)"],
            [880, 1720, 2.5, "rgba(212,174,102,0.18)"],
            [280, 2050, 3, "rgba(110,207,154,0.22)"],
            [720, 2140, 2.2, "rgba(197,212,200,0.16)"],
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
            d="M60 560C140 640 260 720 400 780"
            stroke={`url(#${gid}-gold)`}
            width={0.5}
          />
          <Etch
            d="M640 40C700 120 720 200 680 280"
            stroke={`url(#${gid}-line)`}
            width={0.45}
            dash="2 5"
          />
          <Etch
            d="M1100 900C1140 1050 1130 1250 1080 1400"
            stroke={`url(#${gid}-line)`}
            width={0.45}
          />
          <Etch
            d="M100 1600C180 1750 280 1900 420 2050"
            stroke={`url(#${gid}-gold)`}
            width={0.45}
            dash="3 6"
          />
        </g>
      </svg>
    </div>
  );
}
