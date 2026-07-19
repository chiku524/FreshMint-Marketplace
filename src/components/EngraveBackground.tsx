import { GeneratedPlate } from "@/components/engrave/GeneratedPlate";
import { HomePlate } from "@/components/engrave/HomePlate";
import {
  VARIANT_SEEDS,
  type EngraveVariant,
} from "@/components/engrave/variants";

/**
 * Engraved stone field — hatch + grain + abstract etched plate.
 * Home keeps the original signature artwork; other variants use distinct seeded plates.
 */
export function EngraveBackground({
  variant = "home",
}: {
  variant?: EngraveVariant;
}) {
  const gid = `fm-engrave-${variant}`;

  return (
    <div className="fm-engrave-bg" aria-hidden data-engrave={variant}>
      <div className="fm-engrave-stone" />
      <div className="fm-engrave-hatch" />
      <div className="fm-engrave-grain" />
      <div className="fm-engrave-glow fm-engrave-glow--mint" />
      <div className="fm-engrave-glow fm-engrave-glow--gold" />
      <svg
        key={variant}
        className="fm-engrave-vein fm-engrave-vein--swap"
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
          <filter id={`${gid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="fm-engrave-vein__live" filter={`url(#${gid}-glow)`}>
          {variant === "home" ? (
            <HomePlate gid={gid} />
          ) : (
            <GeneratedPlate gid={gid} seed={VARIANT_SEEDS[variant]} />
          )}
        </g>
      </svg>
    </div>
  );
}
