"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef } from "react";
import { LogoIntro } from "@/remotion/LogoIntro";
import { LOGO_INTRO } from "@/remotion/meta";

export function LogoIntroPlayer({ onEnded }: { onEnded: () => void }) {
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const handleEnded = () => onEnded();
    player.addEventListener("ended", handleEnded);
    return () => player.removeEventListener("ended", handleEnded);
  }, [onEnded]);

  return (
    <div className="fm-intro-splash__stage">
      <Player
        ref={playerRef}
        component={LogoIntro}
        durationInFrames={LOGO_INTRO.durationInFrames}
        compositionWidth={LOGO_INTRO.width}
        compositionHeight={LOGO_INTRO.height}
        fps={LOGO_INTRO.fps}
        autoPlay
        muted
        acknowledgeRemotionLicense
        clickToPlay={false}
        spaceKeyToPlayOrPause={false}
        moveToBeginningWhenEnded={false}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
