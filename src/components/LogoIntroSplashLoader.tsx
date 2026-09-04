"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { LOGO_INTRO_SEEN_KEY } from "@/remotion/meta";

function revealSite() {
  document.documentElement.classList.remove("fm-intro-pending");
}

function skipIntro() {
  try {
    sessionStorage.setItem(LOGO_INTRO_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
  revealSite();
}

function IntroLoading() {
  return (
    <div
      className="fm-intro-splash"
      role="dialog"
      aria-label="Loading FreshMint intro"
      aria-modal="true"
    >
      <button type="button" className="fm-intro-skip" onClick={skipIntro}>
        Skip
      </button>
    </div>
  );
}

class IntroErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    skipIntro();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

const LogoIntroSplashLazy = dynamic(
  () =>
    import("@/components/LogoIntroSplash")
      .then((mod) => mod.LogoIntroSplash)
      .catch((error: unknown) => {
        skipIntro();
        throw error;
      }),
  { ssr: false, loading: IntroLoading },
);

export function LogoIntroSplash() {
  return (
    <IntroErrorBoundary>
      <LogoIntroSplashLazy />
    </IntroErrorBoundary>
  );
}
