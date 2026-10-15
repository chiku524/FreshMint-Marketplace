import { ImageResponse } from "next/og";
import { mintMarkSvgDataUri } from "@/lib/brand/mint-mark-svg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#07110d",
        }}
      >
        <img
          alt=""
          src={mintMarkSvgDataUri("fm-apple")}
          width={180}
          height={180}
        />
      </div>
    ),
    { ...size },
  );
}
