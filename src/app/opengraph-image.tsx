import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { mintMarkSvgDataUri } from "@/lib/brand/mint-mark-svg";
import { OG_TAGLINE, SITE_NAME } from "@/lib/seo/site";

export const alt = `${SITE_NAME} mint sprig — ${OG_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const contra = await readFile(join(process.cwd(), "src/fonts/contra/contra.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          padding: "72px 88px",
          background: "linear-gradient(135deg, #1a3a2c 0%, #0d1c15 48%, #07110d 100%)",
        }}
      >
        <img
          alt=""
          src={mintMarkSvgDataUri("fm-og")}
          width={220}
          height={220}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: 56,
            maxWidth: 760,
          }}
        >
          <div
            style={{
              fontFamily: "Contra",
              fontSize: 84,
              color: "#e8f6ee",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            FreshMint
          </div>
          <div
            style={{
              fontFamily: "Contra",
              fontSize: 34,
              color: "#7ed9a8",
              marginTop: 18,
              lineHeight: 1.25,
            }}
          >
            {OG_TAGLINE}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Contra",
          data: contra,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
