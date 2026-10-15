import {
  MINT_JUNCTION,
  MINT_LATERAL_LEFT,
  MINT_LATERAL_RIGHT,
  MINT_LEAF_ANGLE,
  MINT_LEAF_UP,
  MINT_STEM,
  MINT_VEIN_UP,
  mintLeafTransform,
} from "./mint-mark";

/** Static 64×64 app icon: dark field + fully opened mint sprig. */
export function mintMarkSvg(idPrefix = "fm-icon"): string {
  const field = `${idPrefix}-field`;
  const wash = `${idPrefix}-wash`;
  const leafR = `${idPrefix}-leafR`;
  const leafL = `${idPrefix}-leafL`;
  const left = mintLeafTransform(-MINT_LEAF_ANGLE);
  const right = mintLeafTransform(MINT_LEAF_ANGLE);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="${field}" x1="10" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1a3a2c"/>
      <stop offset="0.5" stop-color="#0d1c15"/>
      <stop offset="1" stop-color="#08110d"/>
    </linearGradient>
    <radialGradient id="${wash}" cx="32" cy="26" r="30" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7ed9a8" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#07110d" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${leafR}" x1="26" y1="14" x2="40" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7ed9a8"/>
      <stop offset="1" stop-color="#4db884"/>
    </linearGradient>
    <linearGradient id="${leafL}" x1="24" y1="14" x2="38" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#4db884"/>
      <stop offset="1" stop-color="#2f8a5e"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#${field})"/>
  <rect width="64" height="64" rx="16" fill="url(#${wash})"/>
  <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.25" stroke="#4db884" stroke-opacity="0.28"/>
  <path d="${MINT_STEM}" stroke="#3d6b52" stroke-width="2.35" stroke-linecap="round"/>
  <g transform="${left}">
    <path d="${MINT_LEAF_UP}" fill="url(#${leafL})"/>
    <path d="${MINT_VEIN_UP}" stroke="#0e2418" stroke-width="1.1" stroke-linecap="round" opacity="0.42"/>
    <path d="${MINT_LATERAL_LEFT}" stroke="#0e2418" stroke-width="0.7" stroke-linecap="round" opacity="0.3"/>
    <path d="${MINT_LATERAL_RIGHT}" stroke="#0e2418" stroke-width="0.7" stroke-linecap="round" opacity="0.3"/>
  </g>
  <g transform="${right}">
    <path d="${MINT_LEAF_UP}" fill="url(#${leafR})"/>
    <path d="${MINT_VEIN_UP}" stroke="#0e2418" stroke-width="1.1" stroke-linecap="round" opacity="0.42"/>
    <path d="${MINT_LATERAL_LEFT}" stroke="#0e2418" stroke-width="0.7" stroke-linecap="round" opacity="0.3"/>
    <path d="${MINT_LATERAL_RIGHT}" stroke="#0e2418" stroke-width="0.7" stroke-linecap="round" opacity="0.3"/>
  </g>
  <circle cx="${MINT_JUNCTION.cx}" cy="${MINT_JUNCTION.cy}" r="${MINT_JUNCTION.r}" fill="#3d6b52"/>
</svg>
`;
}

export function mintMarkSvgDataUri(idPrefix = "fm-icon"): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mintMarkSvg(idPrefix))}`;
}
