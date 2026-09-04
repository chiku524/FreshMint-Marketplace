"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { LOGO_INTRO_REPLAY_EVENT, LOGO_INTRO_SEEN_KEY } from "@/remotion/meta";

type Phase = "checking" | "play" | "leaving" | "done";

function revealSite() {
  document.documentElement.classList.remove("fm-intro-pending");
}

function concealSite() {
  document.documentElement.classList.add("fm-intro-pending");
}

function markSeen() {
  try {
    sessionStorage.setItem(LOGO_INTRO_SEEN_KEY, "1");
  } catch {
    /* private mode */
  }
}

function clearSeen() {
  try {
    sessionStorage.removeItem(LOGO_INTRO_SEEN_KEY);
  } catch {
    /* private mode */
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function shouldForceReplay() {
  return new URLSearchParams(window.location.search).has("intro");
}

function shouldPlayIntro() {
  if (prefersReducedMotion()) return false;
  try {
    return shouldForceReplay() || sessionStorage.getItem(LOGO_INTRO_SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}

class IntroErrorBoundary extends Component<
  { children: ReactNode; onFail: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

const LogoIntroPlayer = dynamic(
  () =>
    import("@/components/LogoIntroSplash").then((mod) => mod.LogoIntroPlayer),
  { ssr: false, loading: () => null },
);

export function LogoIntroSplash() {
  const [phase, setPhase] = useState<Phase>("checking");

  const dismiss = useCallback(() => {
    markSeen();
    setPhase((current) => (current === "done" ? current : "leaving"));
  }, []);

  const play = useCallback(() => {
    if (prefersReducedMotion()) return;
    clearSeen();
    concealSite();
    setPhase("play");
  }, []);

  useEffect(() => {
    if (shouldPlayIntro()) {
      concealSite();
      setPhase("play");
      return;
    }
    markSeen();
    revealSite();
    setPhase("done");
  }, []);

  useEffect(() => {
    function onReplay() {
      play();
    }
    window.addEventListener(LOGO_INTRO_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(LOGO_INTRO_REPLAY_EVENT, onReplay);
  }, [play]);

  useEffect(() => {
    if (phase === "play" || phase === "leaving") {
      concealSite();
      return;
    }
    if (phase === "done") revealSite();
  }, [phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => {
      revealSite();
      setPhase("done");
    }, 420);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "play") return;
    const timer = window.setTimeout(dismiss, 16_000);
    return () => window.clearTimeout(timer);
  }, [phase, dismiss]);

  useEffect(() => {
    if (phase !== "play" && phase !== "leaving") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  if (phase !== "play" && phase !== "leaving") return null;

  return (
    <div
      className={`fm-intro-splash${phase === "leaving" ? " is-leaving" : ""}`}
      role="dialog"
      aria-label="FreshMint brand intro"
      aria-modal="true"
    >
      <IntroErrorBoundary onFail={dismiss}>
        {phase === "play" ? <LogoIntroPlayer onEnded={dismiss} /> : null}
      </IntroErrorBoundary>
      <button type="button" className="fm-intro-skip" onClick={dismiss}>
        Skip
      </button>
    </div>
  );
}
