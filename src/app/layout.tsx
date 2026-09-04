import type { Metadata } from "next";
import { Literata, Syne } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { BrandMark } from "@/components/MintLeaf";
import { LogoIntroSplash } from "@/components/LogoIntroSplashLoader";
import { PageEngraveBackground } from "@/components/PageEngraveBackground";
import { ReplayIntroButton } from "@/components/ReplayIntroButton";
import { SiteNav } from "@/components/SiteNav";
import { WalletBar } from "@/components/WalletBar";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FreshMint Marketplace — Fair Discovery for Digital Art",
  description:
    "NFT marketplace for EVM and Solana with Emerging quotas, composed feeds, and anti-congestion discovery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${literata.variable} h-full`}>
      <body className="min-h-full">
        <Script id="fm-intro-boot" strategy="beforeInteractive">
          {`try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&(sessionStorage.getItem("fm-logo-intro-seen")!=="1"||/[?&]intro(?:[=&]|$)/.test(location.search))){document.documentElement.classList.add("fm-intro-pending")}}catch(e){}`}
        </Script>
        <div className="site-shell">
          <LogoIntroSplash />
          <PageEngraveBackground />
          <header
            className="site-header"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              <Link href="/" style={{ fontSize: "1.3rem" }}>
                <BrandMark size={32} />
              </Link>
              <SiteNav />
            </div>
            <WalletBar />
          </header>
          <main style={{ flex: 1 }}>{children}</main>
          <footer className="site-footer">
            <span>
              Attention is scarce. Emerging artists get a coded quota — not a
              slogan.
            </span>
            <ReplayIntroButton />
          </footer>
        </div>
      </body>
    </html>
  );
}
