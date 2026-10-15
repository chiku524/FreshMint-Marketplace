import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { FreshMintMark } from "./FreshMintMark";
import { body as serif, display } from "./fonts";
import { LOGO_INTRO } from "./meta";

function loopFrame(frame: number, loop: number): number {
  return ((frame % loop) + loop) % loop;
}

export const LogoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const loop = LOGO_INTRO.durationInFrames;
  const t = loopFrame(frame, loop);
  const ease = Easing.bezier(0.22, 1, 0.36, 1);

  return (
    <AbsoluteFill
      name="Logo intro"
      style={{
        backgroundColor: "#09090b",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Interactive.Div
        name="Mint glow"
        style={{
          position: "absolute",
          width: 780,
          height: 780,
          borderRadius: 999,
          background:
            "radial-gradient(circle, rgba(110,207,154,0.2) 0%, rgba(77,184,132,0.06) 46%, rgba(9,9,11,0) 72%)",
          opacity: interpolate(t, [0, 24, 110, loop], [0.18, 1, 0.88, 0.18], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
          scale: interpolate(t, [0, 40, 90, loop], [0.9, 1.04, 1, 0.9], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
            output: "perceptual-scale",
          }),
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Interactive.Div
          name="Leaf mark"
          style={{
            opacity: interpolate(t, [0, 14, 130, loop], [0.08, 1, 1, 0.08], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            scale: interpolate(t, [0, 36, 80, 118, loop], [0.92, 1, 1.03, 1, 0.92], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 18 }),
              output: "perceptual-scale",
            }),
            filter:
              "drop-shadow(0 16px 36px rgba(14,36,24,0.5)) drop-shadow(0 0 22px rgba(110,207,154,0.18))",
          }}
        >
          <FreshMintMark />
        </Interactive.Div>

        <Interactive.Div
          name="Wordmark"
          style={{
            marginTop: 28,
            fontFamily: display,
            fontWeight: 400,
            fontSize: 84,
            letterSpacing: "-0.04em",
            lineHeight: 1,
            color: "#f4f4f5",
            opacity: interpolate(t, [22, 42, 122, 146], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            translate: interpolate(
              t,
              [22, 42, 122, 146],
              ["0px 12px", "0px 0px", "0px 0px", "0px 8px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              },
            ),
          }}
        >
          FreshMint
        </Interactive.Div>

        <Interactive.Div
          name="Gold hairline"
          style={{
            marginTop: 18,
            width: interpolate(t, [38, 60, 118, 142], [0, 140, 140, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            height: 1,
            background:
              "linear-gradient(90deg, rgba(201,149,58,0) 0%, #d4ae66 50%, rgba(201,149,58,0) 100%)",
            opacity: interpolate(t, [38, 56, 118, 142], [0, 0.8, 0.8, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />

        <Interactive.Div
          name="Tagline"
          style={{
            marginTop: 18,
            maxWidth: 640,
            textAlign: "center",
            fontFamily: serif,
            fontWeight: 400,
            fontSize: 24,
            lineHeight: 1.4,
            color: "#a1a1aa",
            opacity: interpolate(t, [46, 66, 116, 140], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
            translate: interpolate(
              t,
              [46, 66, 116, 140],
              ["0px 8px", "0px 0px", "0px 0px", "0px 6px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: ease,
              },
            ),
          }}
        >
          Fair discovery for newer artists.
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
