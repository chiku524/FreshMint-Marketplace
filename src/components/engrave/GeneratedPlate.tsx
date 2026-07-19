import { Etch } from "./Etch";

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function Orbital({
  gid,
  cx,
  cy,
  r,
}: {
  gid: string;
  cx: number;
  cy: number;
  r: number;
}) {
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <Etch
        d={`M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}`}
        stroke={`url(#${gid}-line)`}
        width={1.1}
        opacity={0.8}
      />
      <Etch
        d={`M0 ${-r * 0.66}A${r * 0.66} ${r * 0.66} 0 1 1 0 ${r * 0.66}A${r * 0.66} ${r * 0.66} 0 1 1 0 ${-r * 0.66}`}
        stroke={`url(#${gid}-gold)`}
        width={0.85}
        opacity={0.7}
      />
      <Etch
        d={`M0 ${-r * 0.35}A${r * 0.35} ${r * 0.35} 0 1 1 0 ${r * 0.35}A${r * 0.35} ${r * 0.35} 0 1 1 0 ${-r * 0.35}`}
        stroke={`url(#${gid}-line)`}
        width={0.65}
        opacity={0.55}
        dash="3 7"
      />
      {ticks.map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x1 = Math.cos(a) * r * 0.74;
        const y1 = Math.sin(a) * r * 0.74;
        const x2 = Math.cos(a) * r * 0.95;
        const y2 = Math.sin(a) * r * 0.95;
        return (
          <Etch
            key={deg}
            d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`}
            stroke={`url(#${gid}-line)`}
            width={0.5}
            opacity={0.4}
          />
        );
      })}
    </g>
  );
}

function ContourBloom({
  gid,
  cx,
  cy,
  rx,
  ry,
  goldFirst,
}: {
  gid: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  goldFirst?: boolean;
}) {
  const rings = [1, 0.78, 0.58, 0.4];
  return (
    <g>
      {rings.map((s, i) => {
        const a = rx * s;
        const b = ry * s;
        const d = `M${cx - a} ${cy}C${cx - a * 0.6} ${cy - b} ${cx + a * 0.6} ${cy - b} ${cx + a} ${cy}C${cx + a * 0.6} ${cy + b} ${cx - a * 0.6} ${cy + b} ${cx - a} ${cy}Z`;
        const stroke =
          (goldFirst ? i % 2 === 0 : i % 2 === 1)
            ? `url(#${gid}-gold)`
            : i === rings.length - 1
              ? `url(#${gid}-soft)`
              : `url(#${gid}-line)`;
        return (
          <Etch
            key={i}
            d={d}
            stroke={stroke}
            width={1.15 - i * 0.15}
            opacity={0.68 - i * 0.08}
          />
        );
      })}
      <Etch
        d={`M${cx - rx * 0.55} ${cy + ry * 0.1}C${cx - rx * 0.1} ${cy - ry * 0.05} ${cx + rx * 0.2} ${cy} ${cx + rx * 0.6} ${cy + ry * 0.15}`}
        stroke={`url(#${gid}-gold)`}
        width={0.6}
        opacity={0.5}
        dash="4 6"
      />
    </g>
  );
}

function Facet({
  gid,
  cx,
  cy,
  scale,
  rot,
}: {
  gid: string;
  cx: number;
  cy: number;
  scale: number;
  rot: number;
}) {
  const pts = [
    [-140, -20],
    [0, -80],
    [160, -40],
    [120, 100],
    [-40, 140],
    [-140, -20],
  ].map(([x, y]) => {
    const a = (rot * Math.PI) / 180;
    const xr = x * scale * Math.cos(a) - y * scale * Math.sin(a);
    const yr = x * scale * Math.sin(a) + y * scale * Math.cos(a);
    return [cx + xr, cy + yr] as const;
  });
  const poly = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join("");
  const mid = pts[1];
  const tip = pts[3];
  const left = pts[0];
  return (
    <g>
      <Etch d={`${poly}Z`} stroke={`url(#${gid}-line)`} width={1} opacity={0.58} />
      <Etch
        d={`M${mid[0].toFixed(1)} ${mid[1].toFixed(1)}L${((mid[0] + tip[0]) / 2).toFixed(1)} ${((mid[1] + tip[1]) / 2).toFixed(1)}L${tip[0].toFixed(1)} ${tip[1].toFixed(1)}`}
        stroke={`url(#${gid}-gold)`}
        width={0.7}
        opacity={0.5}
      />
      <Etch
        d={`M${left[0].toFixed(1)} ${left[1].toFixed(1)}L${mid[0].toFixed(1)} ${mid[1].toFixed(1)}L${tip[0].toFixed(1)} ${tip[1].toFixed(1)}`}
        stroke={`url(#${gid}-line)`}
        width={0.55}
        opacity={0.4}
        dash="5 5"
      />
    </g>
  );
}

function Crescents({
  gid,
  x,
  y,
  flip,
}: {
  gid: string;
  x: number;
  y: number;
  flip?: boolean;
}) {
  const dir = flip ? -1 : 1;
  return (
    <g>
      <Etch
        d={`M${x} ${y}C${x + 80 * dir} ${y - 100} ${x + 220 * dir} ${y - 140} ${x + 360 * dir} ${y - 100}C${x + 480 * dir} ${y - 65} ${x + 540 * dir} ${y + 40} ${x + 500 * dir} ${y + 150}`}
        stroke={`url(#${gid}-line)`}
        width={1.1}
        opacity={0.58}
      />
      <Etch
        d={`M${x + 40 * dir} ${y + 40}C${x + 110 * dir} ${y - 40} ${x + 220 * dir} ${y - 70} ${x + 340 * dir} ${y - 35}C${x + 440 * dir} ${y - 5} ${x + 490 * dir} ${y + 80} ${x + 460 * dir} ${y + 170}`}
        stroke={`url(#${gid}-gold)`}
        width={0.85}
        opacity={0.52}
      />
      <Etch
        d={`M${x + 90 * dir} ${y + 80}C${x + 150 * dir} ${y + 20} ${x + 240 * dir} ${y} ${x + 330 * dir} ${y + 30}C${x + 400 * dir} ${y + 55} ${x + 440 * dir} ${y + 120} ${x + 420 * dir} ${y + 190}`}
        stroke={`url(#${gid}-line)`}
        width={0.65}
        opacity={0.42}
        dash="4 7"
      />
    </g>
  );
}

/**
 * Seeded plate in the same engraved language as the home artwork,
 * but with a unique motif layout per route.
 */
export function GeneratedPlate({ gid, seed }: { gid: string; seed: number }) {
  const rand = mulberry32(seed);
  const layout = Math.floor(rand() * 5);

  const orbitals = Array.from({ length: 2 }, () => ({
    cx: lerp(120, 1080, rand()),
    cy: lerp(100, 700, rand()),
    r: lerp(70, 130, rand()),
  }));

  const blooms = Array.from({ length: 2 + (layout === 2 ? 1 : 0) }, () => ({
    cx: lerp(180, 1000, rand()),
    cy: lerp(280, 1600, rand()),
    rx: lerp(140, 240, rand()),
    ry: lerp(100, 180, rand()),
    goldFirst: rand() > 0.5,
  }));

  const facets = Array.from({ length: 1 + (layout === 3 ? 1 : 0) }, () => ({
    cx: lerp(200, 1000, rand()),
    cy: lerp(500, 1800, rand()),
    scale: lerp(0.75, 1.15, rand()),
    rot: lerp(-40, 50, rand()),
  }));

  const crescents = Array.from({ length: layout === 4 ? 2 : 1 }, () => ({
    x: lerp(40, 700, rand()),
    y: lerp(900, 1900, rand()),
    flip: rand() > 0.5,
  }));

  const bottomOrbital = {
    cx: lerp(200, 500, rand()),
    cy: lerp(1900, 2200, rand()),
    r: lerp(70, 110, rand()),
  };

  const spines = Array.from({ length: 6 }, () => {
    const x1 = lerp(40, 1100, rand());
    const y1 = lerp(80, 2200, rand());
    const x2 = lerp(40, 1100, rand());
    const y2 = lerp(80, 2200, rand());
    const cx1 = (x1 + x2) / 2 + lerp(-120, 120, rand());
    const cy1 = (y1 + y2) / 2 + lerp(-160, 160, rand());
    return {
      d: `M${x1.toFixed(0)} ${y1.toFixed(0)}C${cx1.toFixed(0)} ${cy1.toFixed(0)} ${((x1 + x2) / 2).toFixed(0)} ${((y1 + y2) / 2).toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}`,
      gold: rand() > 0.45,
      dash: rand() > 0.7,
    };
  });

  const nodes = Array.from({ length: 12 }, () => ({
    x: lerp(80, 1120, rand()),
    y: lerp(100, 2300, rand()),
    r: lerp(2, 3.4, rand()),
    gold: rand() > 0.5,
  }));

  const scratches = Array.from({ length: 4 }, () => {
    const x1 = lerp(40, 1160, rand());
    const y1 = lerp(60, 2300, rand());
    const x2 = x1 + lerp(-80, 80, rand());
    const y2 = y1 + lerp(120, 320, rand());
    return {
      d: `M${x1.toFixed(0)} ${y1.toFixed(0)}C${(x1 + 40).toFixed(0)} ${(y1 + 80).toFixed(0)} ${x2.toFixed(0)} ${(y2 - 40).toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}`,
      gold: rand() > 0.5,
    };
  });

  const closingBloom =
    layout === 0
      ? {
          cx: lerp(500, 900, rand()),
          cy: lerp(1950, 2200, rand()),
          rx: 200,
          ry: 140,
          goldFirst: true as const,
        }
      : null;

  return (
    <>
      {layout === 1 ? (
        <>
          <Orbital gid={gid} {...orbitals[0]} />
          <Orbital
            gid={gid}
            cx={1200 - orbitals[0].cx}
            cy={orbitals[0].cy + 180}
            r={orbitals[0].r * 0.85}
          />
        </>
      ) : (
        orbitals.map((o, i) => <Orbital key={`o-${i}`} gid={gid} {...o} />)
      )}

      {blooms.map((b, i) => (
        <ContourBloom key={`b-${i}`} gid={gid} {...b} />
      ))}

      {facets.map((f, i) => (
        <Facet key={`f-${i}`} gid={gid} {...f} />
      ))}

      {crescents.map((c, i) => (
        <Crescents key={`c-${i}`} gid={gid} {...c} />
      ))}

      <Orbital gid={gid} {...bottomOrbital} />

      {closingBloom ? (
        <ContourBloom gid={gid} {...closingBloom} />
      ) : null}

      {spines.map((s, i) => (
        <Etch
          key={`s-${i}`}
          d={s.d}
          stroke={s.gold ? `url(#${gid}-gold)` : `url(#${gid}-line)`}
          width={0.75}
          opacity={0.42}
          dash={s.dash ? "6 8" : undefined}
        />
      ))}

      <g fill="none" strokeLinecap="round">
        {nodes.map((n, i) => (
          <g key={`n-${i}`}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r + 1.4}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={1.2}
            />
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              stroke={
                n.gold
                  ? "rgba(212,174,102,0.2)"
                  : i % 3 === 0
                    ? "rgba(110,207,154,0.22)"
                    : "rgba(197,212,200,0.2)"
              }
              strokeWidth={1}
            />
          </g>
        ))}
      </g>

      <g opacity={0.35}>
        {scratches.map((s, i) => (
          <Etch
            key={`x-${i}`}
            d={s.d}
            stroke={s.gold ? `url(#${gid}-gold)` : `url(#${gid}-line)`}
            width={0.45}
            dash={i % 2 ? "3 6" : undefined}
          />
        ))}
      </g>
    </>
  );
}
