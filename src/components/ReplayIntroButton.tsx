"use client";

import { LOGO_INTRO_REPLAY_EVENT } from "@/remotion/meta";

export function ReplayIntroButton() {
  return (
    <button
      type="button"
      className="fm-intro-replay"
      onClick={() => {
        window.dispatchEvent(new Event(LOGO_INTRO_REPLAY_EVENT));
      }}
    >
      Replay intro
    </button>
  );
}
