import type { NextConfig } from "next";

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "freshmint-dev-secret-change-in-production-32b";
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "*.blob.vercel-storage.com" },
    ],
    unoptimized: true,
  },
};

export default nextConfig;
