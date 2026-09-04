import { Composition } from "remotion";
import "./fonts";
import { LogoIntro } from "./LogoIntro";
import { LOGO_INTRO } from "./meta";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={LOGO_INTRO.id}
      component={LogoIntro}
      durationInFrames={LOGO_INTRO.durationInFrames}
      fps={LOGO_INTRO.fps}
      width={LOGO_INTRO.width}
      height={LOGO_INTRO.height}
    />
  );
};
