import type { NextConfig } from "next";

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "freshmint-dev-secret-change-in-production-32b";
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "remotion",
    "@remotion/player",
    "@remotion/google-fonts",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "*.blob.vercel-storage.com" },
    ],
    // Resize + re-encode Blob/remote art per device instead of shipping the
    // original upload. SVG/GIF/data URLs bypass the optimizer in FmImage.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [384, 640, 828, 1080, 1440, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 2678400,
  },
  // Baseline security headers. A full CSP is deliberately not set yet: wallet
  // SDKs, Remotion and Blob media need an audited allowlist first.
  async headers() {
    return [
      {
        // Locally stored uploads are same-origin; if an SVG is opened directly
        // it must not be able to run anything. <img> display is unaffected.
        source: "/uploads/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Upload filenames are unique per upload (timestamp + random), so cache hard.
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:file(freshmint-icon.svg|file.svg|globe.svg|window.svg)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
