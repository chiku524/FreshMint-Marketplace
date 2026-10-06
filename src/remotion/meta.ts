export const LOGO_INTRO = {
  id: "LogoIntro",
  durationInFrames: 150,
  fps: 30,
  width: 1920,
  height: 1080,
  /** Splash plays this many ident cycles, then dismisses. */
  playLoops: 2,
} as const;

export const LOGO_INTRO_PLAY_MS =
  (LOGO_INTRO.durationInFrames / LOGO_INTRO.fps) * LOGO_INTRO.playLoops * 1000;

export const LOGO_INTRO_SEEN_KEY = "fm-logo-intro-seen";
export const LOGO_INTRO_REPLAY_EVENT = "fm-play-logo-intro";
