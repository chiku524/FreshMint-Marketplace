import { loadFont as loadLiterata } from "@remotion/google-fonts/Literata";
import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";

export const { fontFamily: syne } = loadSyne("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

export const { fontFamily: literata } = loadLiterata("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});
