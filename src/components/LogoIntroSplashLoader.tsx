"use client";

import dynamic from "next/dynamic";

export const LogoIntroSplash = dynamic(
  () =>
    import("@/components/LogoIntroSplash").then((mod) => mod.LogoIntroSplash),
  { ssr: false },
);
