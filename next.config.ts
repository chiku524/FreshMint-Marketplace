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
    unoptimized: true,
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
