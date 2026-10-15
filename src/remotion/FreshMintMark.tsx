import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
  MINT_JUNCTION,
  MINT_LATERAL_LEFT,
  MINT_LATERAL_RIGHT,
  MINT_LEAF_ANGLE,
  MINT_LEAF_UP,
  MINT_STEM,
  MINT_VEIN_UP,
  mintLeafTransform,
} from "../lib/brand/mint-mark";
import { LOGO_INTRO } from "./meta";

function loopFrame(frame: number, loop: number): number {
  return ((frame % loop) + loop) % loop;
}

export const FreshMintMark: React.FC = () => {
  const frame = useCurrentFrame();
  const loop = LOGO_INTRO.durationInFrames;
  const t = loopFrame(frame, loop);

  const stemLen = 18;
  const veinLen = 28;
  const ease = Easing.bezier(0.22, 1, 0.36, 1);
  const open = interpolate(t, [8, 34, 122, 148], [14, MINT_LEAF_ANGLE, MINT_LEAF_ANGLE, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const leafScale = interpolate(t, [8, 34, 122, 148], [0.28, 1, 1, 0.28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const leafOpacity = interpolate(t, [8, 22, 124, 148], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const veinDraw = interpolate(t, [20, 40, 124, 146], [veinLen, 0, 0, veinLen], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const veinOpacity = interpolate(t, [20, 36, 124, 146], [0, 0.42, 0.42, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      width={176}
      height={176}
    >
      <defs>
        <linearGradient
          id="fm-field"
          x1="10"
          y1="4"
          x2="56"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1a3a2c" />
          <stop offset="0.5" stopColor="#0d1c15" />
          <stop offset="1" stopColor="#08110d" />
        </linearGradient>
        <radialGradient
          id="fm-wash"
          cx="32"
          cy="26"
          r="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7ed9a8" stopOpacity="0.22" />
          <stop offset="1" stopColor="#07110d" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id="fm-leafR"
          x1="26"
          y1="14"
          x2="40"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7ed9a8" />
          <stop offset="1" stopColor="#4db884" />
        </linearGradient>
        <linearGradient
          id="fm-leafL"
          x1="24"
          y1="14"
          x2="38"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4db884" />
          <stop offset="1" stopColor="#2f8a5e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#fm-field)" />
      <rect width="64" height="64" rx="16" fill="url(#fm-wash)" />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="15.25"
        stroke="#4db884"
        strokeOpacity="0.28"
      />
      <path
        d={MINT_STEM}
        stroke="#3d6b52"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeDasharray={stemLen}
        strokeDashoffset={interpolate(t, [0, 18, 132, 150], [stemLen, 0, 0, stemLen], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
      />
      <g opacity={leafOpacity} transform={mintLeafTransform(-open, leafScale)}>
        <path d={MINT_LEAF_UP} fill="url(#fm-leafL)" />
        <path
          d={MINT_VEIN_UP}
          stroke="#0e2418"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity={veinOpacity}
          strokeDasharray={veinLen}
          strokeDashoffset={veinDraw}
        />
        <path
          d={MINT_LATERAL_LEFT}
          stroke="#0e2418"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity={veinOpacity * 0.7}
        />
        <path
          d={MINT_LATERAL_RIGHT}
          stroke="#0e2418"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity={veinOpacity * 0.7}
        />
      </g>
      <g opacity={leafOpacity} transform={mintLeafTransform(open, leafScale)}>
        <path d={MINT_LEAF_UP} fill="url(#fm-leafR)" />
        <path
          d={MINT_VEIN_UP}
          stroke="#0e2418"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity={veinOpacity}
          strokeDasharray={veinLen}
          strokeDashoffset={veinDraw}
        />
        <path
          d={MINT_LATERAL_LEFT}
          stroke="#0e2418"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity={veinOpacity * 0.72}
        />
        <path
          d={MINT_LATERAL_RIGHT}
          stroke="#0e2418"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity={veinOpacity * 0.72}
        />
      </g>
      <circle
        cx={MINT_JUNCTION.cx}
        cy={MINT_JUNCTION.cy}
        r={MINT_JUNCTION.r}
        fill="#3d6b52"
        opacity={interpolate(t, [14, 28, 126, 148], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
    </svg>
  );
};
