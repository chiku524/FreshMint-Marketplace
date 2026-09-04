import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FreshMintMark } from "./FreshMintMark";
import { literata, syne } from "./fonts";

export const LogoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
          width: 920,
          height: 920,
          borderRadius: 999,
          background:
            "radial-gradient(circle, rgba(110,207,154,0.22) 0%, rgba(77,184,132,0.08) 42%, rgba(9,9,11,0) 70%)",
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      <Interactive.Div
        name="Gold wash"
        style={{
          position: "absolute",
          width: 640,
          height: 420,
          borderRadius: 999,
          background:
            "radial-gradient(circle, rgba(212,174,102,0.1) 0%, rgba(9,9,11,0) 72%)",
          opacity: interpolate(frame, [8, 36], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
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
            opacity: interpolate(frame, [8, 24], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [8, 1 * fps], [0.85, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 16 }),
              output: "perceptual-scale",
            }),
            filter:
              "drop-shadow(0 18px 40px rgba(14,36,24,0.55)) drop-shadow(0 0 28px rgba(110,207,154,0.22))",
          }}
        >
          <FreshMintMark />
        </Interactive.Div>

        <Interactive.Div
          name="Wordmark"
          style={{
            marginTop: 36,
            fontFamily: syne,
            fontWeight: 800,
            fontSize: 92,
            letterSpacing: "-0.035em",
            lineHeight: 1,
            color: "#f4f4f5",
            opacity: interpolate(frame, [38, 62], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [38, 62], ["0px 18px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          FreshMint
        </Interactive.Div>

        <Interactive.Div
          name="Gold hairline"
          style={{
            marginTop: 22,
            width: interpolate(frame, [70, 98], [0, 168], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            height: 1,
            background:
              "linear-gradient(90deg, rgba(201,149,58,0) 0%, #d4ae66 50%, rgba(201,149,58,0) 100%)",
            opacity: interpolate(frame, [70, 90], [0, 0.85], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />

        <Interactive.Div
          name="Tagline"
          style={{
            marginTop: 22,
            maxWidth: 820,
            textAlign: "center",
            fontFamily: literata,
            fontWeight: 400,
            fontSize: 28,
            lineHeight: 1.35,
            color: "#a1a1aa",
            opacity: interpolate(frame, [78, 108], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [78, 108], ["0px 12px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Fair discovery for newer artists — without flooding the room.
        </Interactive.Div>

        <Interactive.Div
          name="Lanes"
          style={{
            marginTop: 18,
            fontFamily: syne,
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#6ecf9a",
            opacity: interpolate(frame, [100, 128], [0, 0.9], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Emerging · Rising · Featured
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
