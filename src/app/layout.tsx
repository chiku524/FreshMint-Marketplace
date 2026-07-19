import type { Metadata } from "next";
import { Literata, Syne } from "next/font/google";
import Link from "next/link";
import { EngraveBackground } from "@/components/EngraveBackground";
import { BrandMark } from "@/components/MintLeaf";
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
        <div className="site-shell">
          <EngraveBackground />
          <header
            className="site-header"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              padding: "1.1rem clamp(1rem, 4vw, 3rem)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              <Link href="/" style={{ fontSize: "1.3rem" }}>
                <BrandMark size={32} />
              </Link>
              <nav
                style={{
                  display: "flex",
                  gap: "1rem",
                  fontSize: "0.95rem",
                  color: "var(--ink-muted)",
                  flexWrap: "wrap",
                }}
              >
                <Link href="/rising">Rising</Link>
                <Link href="/open">Open Lane</Link>
                <Link href="/featured">Featured</Link>
                <Link href="/auctions">Auctions</Link>
                <Link href="/calendar">Calendar</Link>
                <Link href="/shelves">Shelves</Link>
                <Link href="/create">Create</Link>
                <Link href="/studio">Studio</Link>
                <Link href="/moderate">Moderate</Link>
                <Link href="/metrics">Metrics</Link>
                <Link href="/docs">Docs</Link>
              </nav>
            </div>
            <WalletBar />
          </header>
          <main style={{ flex: 1 }}>{children}</main>
          <footer
            style={{
              padding: "2rem clamp(1rem, 4vw, 3rem)",
              borderTop: "1px solid var(--line)",
              color: "var(--ink-muted)",
              fontSize: "0.9rem",
            }}
          >
            Attention is scarce. Emerging artists get a coded quota — not a slogan.
          </footer>
        </div>
      </body>
    </html>
  );
}
