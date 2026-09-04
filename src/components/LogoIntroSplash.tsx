"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoIntro } from "@/remotion/LogoIntro";
import {
  LOGO_INTRO,
  LOGO_INTRO_REPLAY_EVENT,
  LOGO_INTRO_SEEN_KEY,
} from "@/remotion/meta";

function shouldForceReplay() {
  return new URLSearchParams(window.location.search).has("intro");
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function initialPhase(): "play" | "done" {
  if (prefersReducedMotion()) return "done";
  if (shouldForceReplay() || sessionStorage.getItem(LOGO_INTRO_SEEN_KEY) !== "1") {
    return "play";
  }
  return "done";
}

export function LogoIntroSplash() {
  const playerRef = useRef<PlayerRef>(null);
  const [phase, setPhase] = useState<"play" | "leaving" | "done">(initialPhase);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(LOGO_INTRO_SEEN_KEY, "1");
    setPhase((current) => (current === "done" ? current : "leaving"));
  }, []);

  const play = useCallback(() => {
    sessionStorage.removeItem(LOGO_INTRO_SEEN_KEY);
    setPhase("play");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "fm-intro-pending",
      phase === "play" || phase === "leaving",
    );
    return () => document.documentElement.classList.remove("fm-intro-pending");
  }, [phase]);

  useEffect(() => {
    function onReplay() {
      if (prefersReducedMotion()) return;
      play();
    }
    window.addEventListener(LOGO_INTRO_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(LOGO_INTRO_REPLAY_EVENT, onReplay);
  }, [play]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("done"), 420);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "play") return;
    const player = playerRef.current;
    if (!player) return;
    const onEnded = () => dismiss();
    player.addEventListener("ended", onEnded);
    return () => player.removeEventListener("ended", onEnded);
  }, [phase, dismiss]);

  useEffect(() => {
    if (phase !== "play" && phase !== "leaving") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      className={`fm-intro-splash${phase === "leaving" ? " is-leaving" : ""}`}
      role="dialog"
      aria-label="FreshMint brand intro"
      aria-modal="true"
    >
      <div className="fm-intro-splash__stage">
        <Player
          ref={playerRef}
          component={LogoIntro}
          durationInFrames={LOGO_INTRO.durationInFrames}
          compositionWidth={LOGO_INTRO.width}
          compositionHeight={LOGO_INTRO.height}
          fps={LOGO_INTRO.fps}
          autoPlay
          acknowledgeRemotionLicense
          clickToPlay={false}
          spaceKeyToPlayOrPause={false}
          moveToBeginningWhenEnded={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <button type="button" className="fm-intro-skip" onClick={dismiss}>
        Skip
      </button>
    </div>
  );
}
