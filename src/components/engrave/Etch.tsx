export type EtchProps = {
  d: string;
  stroke: string;
  width?: number;
  opacity?: number;
  dash?: string;
};

export function Etch({ d, stroke, width = 1.1, opacity = 1, dash }: EtchProps) {
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
